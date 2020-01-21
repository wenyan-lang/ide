/**
 * Make reactive localStorage binding
 *
 * @param {string} key
 * @param {*} [defaultValue={}]
 * @param {*} [storage=localStorage]
 * @returns
 */
function Storage(key, defaultValue = {}, storage = localStorage) {
  const handlers = {}
  const data = defaultValue
  const raw = storage && storage.getItem(key);

  if (raw) {
    const parsed = JSON.parse(raw)
    Object.assign(data, parsed)
  }

  const on = (prop, handler, immediate = false) => {
    if (!handlers[prop])
      handlers[prop] = [];
    handlers[prop].push(handler);
    if (immediate)
      handler(data[prop])
  }

  const off = (prop, handler) => {
    if (!handlers[prop])
      return
    const idx = handlers[prop].indexOf(handler)
    if (idx >= 0)
      handlers[prop].splice(idx, 1)
  }

  const emit = (prop, data) => {
    if (!handlers[prop])
      return
    for (const handler of handlers[prop])
      handler(data);
  }

  const save = () => {
    if (storage)
      storage.setItem(key, JSON.stringify(data));
  }

  return new Proxy(data, {
    set: (data, prop, value) => {
      data[prop] = value
      emit(prop, value)
      save()
    },
    get: (data, prop) => {
      if (prop === 'on')
        return on
      if (prop === 'off')
        return off
      return data[prop];
    },
    deleteProperty(data, prop) {
      delete data[prop]
      emit(prop, undefined)
      save()
    },
  });
}