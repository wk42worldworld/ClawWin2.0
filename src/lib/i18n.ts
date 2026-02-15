import zhCN from '../locales/zh-CN.json'

type NestedKeyOf<T> = T extends object
  ? {
      [K in keyof T & string]: T[K] extends object
        ? `${K}.${NestedKeyOf<T[K]>}`
        : K
    }[keyof T & string]
  : never

type TranslationKey = NestedKeyOf<typeof zhCN>

const translations: Record<string, typeof zhCN> = {
  'zh-CN': zhCN,
}

let currentLocale = 'zh-CN'

export function setLocale(locale: string) {
  if (translations[locale]) {
    currentLocale = locale
  }
}

export function getLocale(): string {
  return currentLocale
}

export function t(key: TranslationKey, params?: Record<string, string>): string {
  const keys = key.split('.')
  let value: unknown = translations[currentLocale]

  for (const k of keys) {
    if (value && typeof value === 'object') {
      value = (value as Record<string, unknown>)[k]
    } else {
      return key
    }
  }

  if (typeof value !== 'string') {
    return key
  }

  if (params) {
    return Object.entries(params).reduce(
      (str, [k, v]) => str.replace(new RegExp(`\\{${k}\\}`, 'g'), v),
      value
    )
  }

  return value
}
