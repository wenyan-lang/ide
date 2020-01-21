/**
 * Make reactive localStorage binding
 *
 * @param {*} key
 * @param {*} [defaultValue={}]
 * @param {*} [storage=localStorage]
 * @param {boolean} [save=true]
 * @returns
 */
function Storage(key, defaultValue = {}, storage = localStorage) {
  const handlers = {}
  let data = defaultValue
  let raw = storage.getItem(key);

  if (raw) {
    const parsed = JSON.parse(raw)
    Object.assign(data, parsed)
  }

  const on = (eventName, handler) => {
    if (!handlers[eventName])
      handlers[eventName] = [];
    handlers[eventName].push(handler);
  }

  const off = (eventName, handler) => {
    if (!handlers[eventName])
      return
    const idx = handlers[eventName].indexOf(handler)
    if (idx >= 0)
      handlers[eventName].splice(idx, 1)
  }

  const emit = (eventName, data) => {
    if (!handlers[eventName])
      return
    for (const handler of handlers[eventName])
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