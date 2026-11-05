/* dsh-session-batch-manager host — bundled, zero runtime externals. */

// src/host/index.ts
import { rm } from "node:fs/promises";
import path from "node:path";

// node_modules/.pnpm/@deepseek-ai+cosmokit@1.8.7-alpha.1/node_modules/@deepseek-ai/cosmokit/lib/index.js
function isNullable(value) {
  return value === null || value === void 0;
}
function isPlainObject(data) {
  return data && typeof data === "object" && !Array.isArray(data);
}
function filterKeys(object, filter) {
  return Object.fromEntries(Object.entries(object).filter(([key, value]) => filter(key, value)));
}
function mapValues(object, transform) {
  return Object.fromEntries(Object.entries(object).map(([key, value]) => [key, transform(value, key)]));
}
function pick(source, keys, forced) {
  if (!keys) return { ...source };
  const result = {};
  for (const key of keys) if (forced || source[key] !== void 0) result[key] = source[key];
  return result;
}
var write = Symbol.for("cosmokit.volatile.write");
function snapshot(value, ancestors = /* @__PURE__ */ new Set()) {
  if (typeof value === "function") throw new TypeError("volatile config cannot contain functions");
  if (value === null || typeof value !== "object") return value;
  if (ancestors.has(value)) throw new TypeError("volatile config cannot contain cycles");
  ancestors.add(value);
  try {
    if (Array.isArray(value)) return Object.freeze(value.map((item) => snapshot(item, ancestors)));
    if (Object.getPrototypeOf(value) !== Object.prototype && Object.getPrototypeOf(value) !== null) throw new TypeError("volatile config objects must be plain objects or arrays");
    return Object.freeze(Object.fromEntries(Object.entries(value).map(([key, item]) => [key, snapshot(item, ancestors)])));
  } finally {
    ancestors.delete(value);
  }
}
function createVolatile(value) {
  let current = snapshot(value);
  return Object.freeze({
    get: () => current,
    [write]: (value2) => {
      current = value2;
    }
  });
}
function isVolatile(value) {
  return typeof value === "object" && value !== null && write in value;
}
function is(type, value) {
  if (arguments.length === 1) return (value2) => is(type, value2);
  return type in globalThis && value instanceof globalThis[type] || Object.prototype.toString.call(value).slice(8, -1) === type;
}
function isArrayBufferLike(value) {
  return is("ArrayBuffer", value) || is("SharedArrayBuffer", value);
}
function isArrayBufferSource(value) {
  return isArrayBufferLike(value) || ArrayBuffer.isView(value);
}
var Binary;
(function(Binary2) {
  Binary2.is = isArrayBufferLike;
  Binary2.isSource = isArrayBufferSource;
  function fromSource(source) {
    if (ArrayBuffer.isView(source)) return source.buffer.slice(source.byteOffset, source.byteOffset + source.byteLength);
    else return source;
  }
  Binary2.fromSource = fromSource;
  function toBase64(source) {
    source = fromSource(source);
    if (typeof Buffer !== "undefined") return Buffer.from(source).toString("base64");
    let binary = "";
    const bytes = new Uint8Array(source);
    for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i]);
    return btoa(binary);
  }
  Binary2.toBase64 = toBase64;
  function fromBase64(source) {
    if (typeof Buffer !== "undefined") return fromSource(Buffer.from(source, "base64"));
    return Uint8Array.from(atob(source), (c) => c.charCodeAt(0));
  }
  Binary2.fromBase64 = fromBase64;
  function toHex(source) {
    source = fromSource(source);
    if (typeof Buffer !== "undefined") return Buffer.from(source).toString("hex");
    return Array.from(new Uint8Array(source), (byte) => byte.toString(16).padStart(2, "0")).join("");
  }
  Binary2.toHex = toHex;
  function fromHex(source) {
    if (typeof Buffer !== "undefined") return fromSource(Buffer.from(source, "hex"));
    const hex = source.length % 2 === 0 ? source : source.slice(0, source.length - 1);
    const buffer = [];
    for (let i = 0; i < hex.length; i += 2) buffer.push(parseInt(`${hex[i]}${hex[i + 1]}`, 16));
    return Uint8Array.from(buffer).buffer;
  }
  Binary2.fromHex = fromHex;
})(Binary || (Binary = {}));
var base64ToArrayBuffer = Binary.fromBase64;
var arrayBufferToBase64 = Binary.toBase64;
var hexToArrayBuffer = Binary.fromHex;
var arrayBufferToHex = Binary.toHex;
function clone(source, refs = /* @__PURE__ */ new Map()) {
  if (!source || typeof source !== "object") return source;
  if (is("Date", source)) return new Date(source.valueOf());
  if (is("RegExp", source)) return new RegExp(source.source, source.flags);
  if (isArrayBufferLike(source)) return source.slice(0);
  if (ArrayBuffer.isView(source)) return source.buffer.slice(source.byteOffset, source.byteOffset + source.byteLength);
  const cached = refs.get(source);
  if (cached) return cached;
  if (Array.isArray(source)) {
    const result2 = [];
    refs.set(source, result2);
    source.forEach((value, index) => {
      result2[index] = Reflect.apply(clone, null, [value, refs]);
    });
    return result2;
  }
  const result = Object.create(Object.getPrototypeOf(source));
  refs.set(source, result);
  for (const key of Reflect.ownKeys(source)) {
    const descriptor = { ...Reflect.getOwnPropertyDescriptor(source, key) };
    if ("value" in descriptor) descriptor.value = Reflect.apply(clone, null, [descriptor.value, refs]);
    Reflect.defineProperty(result, key, descriptor);
  }
  return result;
}
function deepEqual(a, b, strict) {
  const ancestors = /* @__PURE__ */ new Set();
  function compare(a2, b2) {
    if (a2 === b2) return true;
    if (isVolatile(a2) || isVolatile(b2)) return isVolatile(a2) && isVolatile(b2);
    if (!strict && isNullable(a2) && isNullable(b2)) return true;
    if (typeof a2 !== typeof b2 || typeof a2 !== "object" || !a2 || !b2) return false;
    if (ancestors.has(a2)) return false;
    function check(test, then) {
      return test(a2) ? test(b2) ? then(a2, b2) : false : test(b2) ? false : void 0;
    }
    ancestors.add(a2);
    try {
      return check(Array.isArray, (a3, b3) => {
        if (a3.length !== b3.length) return false;
        for (let index = 0; index < a3.length; index++) if (!compare(a3[index], b3[index])) return false;
        return true;
      }) ?? check(is("Date"), (a3, b3) => a3.valueOf() === b3.valueOf()) ?? check(is("URL"), (a3, b3) => a3.href === b3.href) ?? check(is("RegExp"), (a3, b3) => a3.source === b3.source && a3.flags === b3.flags) ?? check(isArrayBufferLike, (a3, b3) => {
        if (a3.byteLength !== b3.byteLength) return false;
        const viewA = new Uint8Array(a3);
        const viewB = new Uint8Array(b3);
        for (let i = 0; i < viewA.length; i++) if (viewA[i] !== viewB[i]) return false;
        return true;
      }) ?? ((!strict || [a2, b2].every((value) => Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null)) && Object.keys({
        ...a2,
        ...b2
      }).every((key) => compare(a2[key], b2[key])));
    } finally {
      ancestors.delete(a2);
    }
  }
  return compare(a, b);
}
var Time;
(function(Time2) {
  Time2.millisecond = 1;
  Time2.second = 1e3;
  Time2.minute = Time2.second * 60;
  Time2.hour = Time2.minute * 60;
  Time2.day = Time2.hour * 24;
  Time2.week = Time2.day * 7;
  let timezoneOffset = (/* @__PURE__ */ new Date()).getTimezoneOffset();
  function setTimezoneOffset(offset) {
    timezoneOffset = offset;
  }
  Time2.setTimezoneOffset = setTimezoneOffset;
  function getTimezoneOffset() {
    return timezoneOffset;
  }
  Time2.getTimezoneOffset = getTimezoneOffset;
  function getDateNumber(date2 = /* @__PURE__ */ new Date(), offset) {
    if (typeof date2 === "number") date2 = new Date(date2);
    if (offset === void 0) offset = timezoneOffset;
    return Math.floor((date2.valueOf() / Time2.minute - offset) / 1440);
  }
  Time2.getDateNumber = getDateNumber;
  function fromDateNumber(value, offset) {
    const date2 = new Date(value * Time2.day);
    if (offset === void 0) offset = timezoneOffset;
    return new Date(+date2 + offset * Time2.minute);
  }
  Time2.fromDateNumber = fromDateNumber;
  const numeric = /\d+(?:\.\d+)?/.source;
  const timeRegExp = new RegExp(`^${[
    "w(?:eek(?:s)?)?",
    "d(?:ay(?:s)?)?",
    "h(?:our(?:s)?)?",
    "m(?:in(?:ute)?(?:s)?)?",
    "s(?:ec(?:ond)?(?:s)?)?"
  ].map((unit) => `(${numeric}${unit})?`).join("")}$`);
  function parseTime(source) {
    const capture = timeRegExp.exec(source);
    if (!capture) return 0;
    return (parseFloat(capture[1]) * Time2.week || 0) + (parseFloat(capture[2]) * Time2.day || 0) + (parseFloat(capture[3]) * Time2.hour || 0) + (parseFloat(capture[4]) * Time2.minute || 0) + (parseFloat(capture[5]) * Time2.second || 0);
  }
  Time2.parseTime = parseTime;
  function parseDate(date2) {
    const parsed = parseTime(date2);
    if (parsed) date2 = Date.now() + parsed;
    else if (/^\d{1,2}(:\d{1,2}){1,2}$/.test(date2)) date2 = `${(/* @__PURE__ */ new Date()).toLocaleDateString()}-${date2}`;
    else if (/^\d{1,2}-\d{1,2}-\d{1,2}(:\d{1,2}){1,2}$/.test(date2)) date2 = `${(/* @__PURE__ */ new Date()).getFullYear()}-${date2}`;
    return date2 ? new Date(date2) : /* @__PURE__ */ new Date();
  }
  Time2.parseDate = parseDate;
  function format(ms) {
    const abs = Math.abs(ms);
    if (abs >= Time2.day - Time2.hour / 2) return Math.round(ms / Time2.day) + "d";
    else if (abs >= Time2.hour - Time2.minute / 2) return Math.round(ms / Time2.hour) + "h";
    else if (abs >= Time2.minute - Time2.second / 2) return Math.round(ms / Time2.minute) + "m";
    else if (abs >= Time2.second) return Math.round(ms / Time2.second) + "s";
    return ms + "ms";
  }
  Time2.format = format;
  function toDigits(source, length = 2) {
    return source.toString().padStart(length, "0");
  }
  Time2.toDigits = toDigits;
  function template(template2, time = /* @__PURE__ */ new Date()) {
    return template2.replace("yyyy", time.getFullYear().toString()).replace("yy", time.getFullYear().toString().slice(2)).replace("MM", toDigits(time.getMonth() + 1)).replace("dd", toDigits(time.getDate())).replace("hh", toDigits(time.getHours())).replace("mm", toDigits(time.getMinutes())).replace("ss", toDigits(time.getSeconds())).replace("SSS", toDigits(time.getMilliseconds(), 3));
  }
  Time2.template = template;
})(Time || (Time = {}));

// node_modules/.pnpm/@deepseek-ai+schemastery@3.18.6-alpha.1/node_modules/@deepseek-ai/schemastery/lib/index.mjs
var kSchema = Symbol.for("schemastery");
var kValidationError = Symbol.for("ValidationError");
globalThis.__schemastery_index__ ??= 0;
globalThis.__schemastery_refs__ = void 0;
var ValidationError = class extends TypeError {
  options;
  name = "ValidationError";
  constructor(message, options) {
    let prefix = "$";
    for (const segment of options.path || []) if (typeof segment === "string") prefix += "." + segment;
    else if (typeof segment === "number") prefix += "[" + segment + "]";
    else if (typeof segment === "symbol") prefix += `[Symbol(${segment.toString()})]`;
    if (prefix.startsWith(".")) prefix = prefix.slice(1);
    super((prefix === "$" ? "" : `${prefix} `) + message);
    this.options = options;
  }
  static is(error) {
    return !!error?.[kValidationError];
  }
};
Object.defineProperty(ValidationError.prototype, kValidationError, { value: true });
var Schema = function(options) {
  const schema = function(data, options2 = {}) {
    return Schema.resolve(data, schema, options2)[0];
  };
  if (options.refs) {
    const refs = mapValues(options.refs, (options2) => new Schema(options2));
    const getRef = (uid) => refs[uid];
    for (const key in refs) {
      const options2 = refs[key];
      options2.sKey = getRef(options2.sKey);
      options2.inner = getRef(options2.inner);
      options2.list = options2.list && options2.list.map(getRef);
      options2.dict = options2.dict && mapValues(options2.dict, getRef);
    }
    return refs[options.uid];
  }
  Object.assign(schema, options);
  if (typeof schema.callback === "string") try {
    schema.callback = new Function("return " + schema.callback)();
  } catch {
  }
  Object.defineProperty(schema, "uid", { value: globalThis.__schemastery_index__++ });
  Object.setPrototypeOf(schema, Schema.prototype);
  schema.meta ||= {};
  schema.toString = schema.toString.bind(schema);
  return schema;
};
Schema.prototype = Object.create(Function.prototype);
Schema.prototype[kSchema] = true;
Object.defineProperty(Schema.prototype, "~standard", { get() {
  return {
    version: 1,
    vendor: "schemastery",
    validate: (value) => {
      try {
        return { value: Schema.resolve(value, this, {})[0] };
      } catch (error) {
        if (ValidationError.is(error)) return { issues: [{
          message: error.message,
          path: error.options.path
        }] };
        throw error;
      }
    }
  };
} });
Schema.ValidationError = ValidationError;
Schema.prototype.toJSON = function toJSON() {
  if (globalThis.__schemastery_refs__) {
    globalThis.__schemastery_refs__[this.uid] ??= JSON.parse(JSON.stringify({ ...this }));
    return this.uid;
  }
  globalThis.__schemastery_refs__ = { [this.uid]: { ...this } };
  globalThis.__schemastery_refs__[this.uid] = JSON.parse(JSON.stringify({ ...this }));
  const result = {
    uid: this.uid,
    refs: globalThis.__schemastery_refs__
  };
  globalThis.__schemastery_refs__ = void 0;
  return result;
};
Schema.prototype.set = function set(key, value) {
  this.dict[key] = value;
  return this;
};
Schema.prototype.push = function push(value) {
  this.list.push(value);
  return this;
};
function mergeDesc(original, messages) {
  const result = typeof original === "string" ? { "": original } : { ...original };
  for (const locale in messages) {
    const value = messages[locale];
    if (value?.$description || value?.$desc) result[locale] = value.$description || value.$desc;
    else if (typeof value === "string") result[locale] = value;
  }
  return result;
}
function getInner(value) {
  return value?.$value ?? value?.$inner;
}
function extractKeys(data) {
  return filterKeys(data ?? {}, (key) => !key.startsWith("$"));
}
Schema.prototype.i18n = function i18n(messages) {
  const schema = Schema(this);
  const desc = mergeDesc(schema.meta.description, messages);
  if (Object.keys(desc).length) schema.meta.description = desc;
  if (schema.dict) schema.dict = mapValues(schema.dict, (inner, key) => {
    return inner.i18n(mapValues(messages, (data) => getInner(data)?.[key] ?? data?.[key]));
  });
  if (schema.list) schema.list = schema.list.map((inner, index) => {
    return inner.i18n(mapValues(messages, (data = {}) => {
      if (Array.isArray(getInner(data))) return getInner(data)[index];
      if (Array.isArray(data)) return data[index];
      return extractKeys(data);
    }));
  });
  if (schema.inner) schema.inner = schema.inner.i18n(mapValues(messages, (data) => {
    if (getInner(data)) return getInner(data);
    return extractKeys(data);
  }));
  if (schema.sKey) schema.sKey = schema.sKey.i18n(mapValues(messages, (data) => data?.$key));
  return schema;
};
Schema.prototype.extra = function extra(key, value) {
  const schema = Schema(this);
  schema.meta = {
    ...schema.meta,
    [key]: value
  };
  return schema;
};
for (const key of [
  "required",
  "disabled",
  "collapse",
  "hidden",
  "loose"
]) Object.assign(Schema.prototype, { [key](value = true) {
  const schema = Schema(this);
  schema.meta = {
    ...schema.meta,
    [key]: value
  };
  return schema;
} });
Schema.prototype.deprecated = function deprecated() {
  const schema = Schema(this);
  schema.meta.badges ||= [];
  schema.meta.badges.push({
    text: "deprecated",
    type: "danger"
  });
  return schema;
};
Schema.prototype.experimental = function experimental() {
  const schema = Schema(this);
  schema.meta.badges ||= [];
  schema.meta.badges.push({
    text: "experimental",
    type: "warning"
  });
  return schema;
};
Schema.prototype.pattern = function pattern(regexp) {
  const schema = Schema(this);
  const pattern2 = pick(regexp, ["source", "flags"]);
  schema.meta = {
    ...schema.meta,
    pattern: pattern2
  };
  return schema;
};
Schema.prototype.simplify = function simplify(value) {
  if (isVolatile(value)) value = value.get();
  if (deepEqual(value, this.meta.default, this.type === "dict")) return null;
  if (isNullable(value)) return value;
  if (this.type === "object" || this.type === "dict") {
    const result = {};
    for (const key in value) {
      const item = (this.type === "object" ? this.dict[key] : this.inner)?.simplify(value[key]);
      if (this.type === "dict" || !isNullable(item)) result[key] = item;
    }
    if (deepEqual(result, this.meta.default, this.type === "dict")) return null;
    return result;
  } else if (this.type === "array" || this.type === "tuple") {
    const result = [];
    value.forEach((value2, index) => {
      const schema = this.type === "array" ? this.inner : this.list[index];
      const item = schema ? schema.simplify(value2) : value2;
      result.push(item);
    });
    return result;
  } else if (this.type === "intersect") {
    const result = {};
    for (const item of this.list) Object.assign(result, item.simplify(value));
    return result;
  } else if (this.type === "union") for (const schema of this.list) try {
    Schema.resolve(value, schema, {});
    return schema.simplify(value);
  } catch {
  }
  return value;
};
Schema.prototype.toString = function toString(inline) {
  return formatters[this.type]?.(this, inline) ?? `Schema<${this.type}>`;
};
Schema.prototype.role = function role(role, extra2) {
  const schema = Schema(this);
  schema.meta = {
    ...schema.meta,
    role,
    extra: extra2
  };
  return schema;
};
for (const key of [
  "default",
  "link",
  "comment",
  "description",
  "max",
  "min",
  "step"
]) Object.assign(Schema.prototype, { [key](value) {
  const schema = Schema(this);
  schema.meta = {
    ...schema.meta,
    [key]: value
  };
  return schema;
} });
Schema.prototype.volatile = function volatile() {
  if (this.meta.volatile) throw new TypeError("volatile schema is already wrapped");
  return this.extra("volatile", true);
};
var resolvers = {};
var checkedVolatile = Symbol("checked-volatile-schema");
function validateVolatileSchema(schema, path2 = [], blocked = false, seen = /* @__PURE__ */ new Map()) {
  const states = seen.get(schema) ?? /* @__PURE__ */ new Set();
  if (states.has(blocked)) return;
  states.add(blocked);
  seen.set(schema, states);
  if (schema.meta?.volatile && blocked) throw new ValidationError("volatile fields require a fixed object path without an enclosing volatile field", { path: path2 });
  const nested = blocked || !!schema.meta?.volatile;
  if (schema.dict) for (const [key, child] of Object.entries(schema.dict)) validateVolatileSchema(child, [...path2, key], nested, seen);
  if (schema.sKey) validateVolatileSchema(schema.sKey, [...path2, "<key>"], true, seen);
  if (schema.inner && (schema.type !== "lazy" || schema.inner[kSchema])) validateVolatileSchema(schema.inner, [...path2, "*"], true, seen);
  if (schema.list) for (let index = 0; index < schema.list.length; index++) validateVolatileSchema(schema.list[index], [...path2, String(index)], true, seen);
}
Schema.extend = function extend(type, resolve2) {
  resolvers[type] = resolve2;
};
Schema.resolve = function resolve(data, schema, options = {}, strict = false) {
  if (!schema) return [data];
  if (!options[checkedVolatile]) {
    validateVolatileSchema(schema, options.path);
    options = {
      ...options,
      [checkedVolatile]: true
    };
  }
  if (schema.meta?.volatile) {
    const inner = Schema(schema);
    inner.meta = {
      ...schema.meta,
      volatile: false
    };
    const [value, adapted] = Schema.resolve(data, inner, options, strict);
    try {
      return [createVolatile(value), adapted];
    } catch (error) {
      throw new ValidationError(error instanceof Error ? error.message : String(error), options);
    }
  }
  if (options.ignore?.(data, schema)) return [data];
  if (isNullable(data) && schema.type !== "lazy") {
    if (schema.meta.required) throw new ValidationError(`missing required value`, options);
    let current = schema;
    let fallback = schema.meta.default;
    while (current?.type === "intersect" && isNullable(fallback)) {
      current = current.list[0];
      fallback = current?.meta.default;
    }
    if (isNullable(fallback)) return [data];
    data = clone(fallback);
  }
  const callback = resolvers[schema.type];
  if (!callback) throw new ValidationError(`unsupported type "${schema.type}"`, options);
  try {
    return callback(data, schema, options, strict);
  } catch (error) {
    if (!schema.meta.loose) throw error;
    return [schema.meta.default];
  }
};
Schema.from = function from(source) {
  if (isNullable(source)) return Schema.any();
  else if ([
    "string",
    "number",
    "boolean"
  ].includes(typeof source)) return Schema.const(source).required();
  else if (source[kSchema]) return source;
  else if (typeof source === "function") switch (source) {
    case String:
      return Schema.string().required();
    case Number:
      return Schema.number().required();
    case Boolean:
      return Schema.boolean().required();
    case Function:
      return Schema.function().required();
    default:
      return Schema.is(source).required();
  }
  else throw new TypeError(`cannot infer schema from ${source}`);
};
Schema.lazy = function lazy(builder) {
  const toJSON2 = () => {
    if (!schema.inner[kSchema]) {
      schema.inner = schema.builder();
      schema.inner.meta = {
        ...schema.meta,
        ...schema.inner.meta
      };
    }
    return schema.inner.toJSON();
  };
  const schema = new Schema({
    type: "lazy",
    builder,
    inner: { toJSON: toJSON2 }
  });
  return schema;
};
Schema.natural = function natural() {
  return Schema.number().step(1).min(0);
};
Schema.percent = function percent() {
  return Schema.number().step(0.01).min(0).max(1).role("slider");
};
Schema.date = function date() {
  return Schema.union([Schema.is(Date), Schema.transform(Schema.string().role("datetime"), (value, options) => {
    const date2 = new Date(value);
    if (isNaN(+date2)) throw new ValidationError(`invalid date "${value}"`, options);
    return date2;
  }, true)]);
};
Schema.regExp = function regExp(flag = "") {
  return Schema.union([Schema.is(RegExp), Schema.transform(Schema.string().role("regexp", { flag }), (value, options) => {
    try {
      return new RegExp(value, flag);
    } catch (e) {
      throw new ValidationError(e.message, options);
    }
  }, true)]);
};
Schema.arrayBuffer = function arrayBuffer(encoding) {
  return Schema.union([
    Schema.is(ArrayBuffer),
    Schema.is(SharedArrayBuffer),
    Schema.transform(Schema.any(), (value, options) => {
      if (Binary.isSource(value)) return Binary.fromSource(value);
      throw new ValidationError(`expected ArrayBufferSource but got ${value}`, options);
    }, true),
    ...encoding ? [Schema.transform(Schema.string(), (value, options) => {
      try {
        return encoding === "base64" ? Binary.fromBase64(value) : Binary.fromHex(value);
      } catch (e) {
        throw new ValidationError(e.message, options);
      }
    }, true)] : []
  ]);
};
Schema.extend("lazy", (data, schema, options, strict) => {
  if (!schema.inner[kSchema]) {
    schema.inner = schema.builder();
    schema.inner.meta = {
      ...schema.meta,
      ...schema.inner.meta
    };
    validateVolatileSchema(schema.inner, options.path, true);
  }
  return Schema.resolve(data, schema.inner, options, strict);
});
Schema.extend("any", (data) => {
  return [data];
});
Schema.extend("never", (data, _, options) => {
  throw new ValidationError(`expected nullable but got ${data}`, options);
});
Schema.extend("const", (data, { value }, options) => {
  if (deepEqual(data, value)) return [value];
  throw new ValidationError(`expected ${value} but got ${data}`, options);
});
function checkWithinRange(data, meta, description, options, skipMin = false) {
  const { max = Infinity, min = -Infinity } = meta;
  if (data > max) throw new ValidationError(`expected ${description} <= ${max} but got ${data}`, options);
  if (data < min && !skipMin) throw new ValidationError(`expected ${description} >= ${min} but got ${data}`, options);
}
Schema.extend("string", (data, { meta }, options) => {
  if (typeof data !== "string") throw new ValidationError(`expected string but got ${data}`, options);
  if (meta.pattern) {
    const regexp = new RegExp(meta.pattern.source, meta.pattern.flags);
    if (!regexp.test(data)) throw new ValidationError(`expect string to match regexp ${regexp}`, options);
  }
  checkWithinRange(data.length, meta, "string length", options);
  return [data];
});
function decimalShift(data, digits) {
  const str = data.toString();
  if (str.includes("e")) return data * Math.pow(10, digits);
  const index = str.indexOf(".");
  if (index === -1) return data * Math.pow(10, digits);
  const frac = str.slice(index + 1);
  const integer = str.slice(0, index);
  if (frac.length <= digits) return +(integer + frac.padEnd(digits, "0"));
  return +(integer + frac.slice(0, digits) + "." + frac.slice(digits));
}
function isMultipleOf(data, min, step) {
  step = Math.abs(step);
  if (!/^\d+\.\d+$/.test(step.toString())) return (data - min) % step === 0;
  const index = step.toString().indexOf(".");
  const digits = step.toString().slice(index + 1).length;
  return Math.abs(decimalShift(data, digits) - decimalShift(min, digits)) % decimalShift(step, digits) === 0;
}
Schema.extend("number", (data, { meta }, options) => {
  if (typeof data !== "number") throw new ValidationError(`expected number but got ${data}`, options);
  checkWithinRange(data, meta, "number", options);
  const { step } = meta;
  if (step && !isMultipleOf(data, meta.min ?? 0, step)) throw new ValidationError(`expected number multiple of ${step} but got ${data}`, options);
  return [data];
});
Schema.extend("boolean", (data, _, options) => {
  if (typeof data === "boolean") return [data];
  throw new ValidationError(`expected boolean but got ${data}`, options);
});
Schema.extend("bitset", (data, { bits, meta }, options) => {
  let value = 0, keys = [];
  if (typeof data === "number") {
    value = data;
    for (const key in bits) if (data & bits[key]) keys.push(key);
  } else if (Array.isArray(data)) {
    keys = data;
    for (const key of keys) {
      if (typeof key !== "string") throw new ValidationError(`expected string but got ${key}`, options);
      if (key in bits) value |= bits[key];
    }
  } else throw new ValidationError(`expected number or array but got ${data}`, options);
  if (value === meta.default) return [value];
  return [value, keys];
});
Schema.extend("function", (data, _, options) => {
  if (typeof data === "function") return [data];
  throw new ValidationError(`expected function but got ${data}`, options);
});
Schema.extend("is", (data, { constructor }, options) => {
  if (typeof constructor === "function") {
    if (data instanceof constructor) return [data];
    throw new ValidationError(`expected ${constructor.name} but got ${data}`, options);
  } else {
    if (isNullable(data)) throw new ValidationError(`expected ${constructor} but got ${data}`, options);
    let prototype = Object.getPrototypeOf(data);
    while (prototype) {
      if (prototype.constructor?.name === constructor) return [data];
      prototype = Object.getPrototypeOf(prototype);
    }
    throw new ValidationError(`expected ${constructor} but got ${data}`, options);
  }
});
function property(data, key, schema, options) {
  try {
    const [value, adapted] = Schema.resolve(data[key], schema, {
      ...options,
      path: [...options.path || [], key]
    });
    if (adapted !== void 0) data[key] = adapted;
    return value;
  } catch (e) {
    if (!options?.autofix) throw e;
    delete data[key];
    return schema.meta.volatile ? createVolatile(schema.meta.default) : schema.meta.default;
  }
}
Schema.extend("array", (data, { inner, meta }, options) => {
  if (!Array.isArray(data)) throw new ValidationError(`expected array but got ${data}`, options);
  checkWithinRange(data.length, meta, "array length", options, !isNullable(inner.meta.default));
  return [data.map((_, index) => property(data, index, inner, options))];
});
Schema.extend("dict", (data, { inner, sKey }, options, strict) => {
  if (!isPlainObject(data)) throw new ValidationError(`expected object but got ${data}`, options);
  const result = {};
  for (const key in data) {
    let rKey;
    try {
      rKey = Schema.resolve(key, sKey, options)[0];
    } catch (error) {
      if (strict) continue;
      throw error;
    }
    result[rKey] = property(data, key, inner, options);
    data[rKey] = data[key];
    if (key !== rKey) delete data[key];
  }
  return [result];
});
Schema.extend("tuple", (data, { list }, options, strict) => {
  if (!Array.isArray(data)) throw new ValidationError(`expected array but got ${data}`, options);
  const result = list.map((inner, index) => property(data, index, inner, options));
  if (strict) return [result];
  result.push(...data.slice(list.length));
  return [result];
});
function merge(result, data) {
  for (const key in data) {
    if (key in result) continue;
    result[key] = data[key];
  }
}
Schema.extend("object", (data, { dict }, options, strict) => {
  if (!isPlainObject(data)) throw new ValidationError(`expected object but got ${data}`, options);
  const result = {};
  for (const key in dict) {
    const value = property(data, key, dict[key], options);
    if (!isNullable(value) || key in data) result[key] = value;
  }
  if (!strict) merge(result, data);
  return [result];
});
Schema.extend("union", (data, { list, toString: toString2 }, options, strict) => {
  const messages = [];
  for (const inner of list) try {
    return Schema.resolve(data, inner, options, strict);
  } catch (error) {
    messages.push(error);
  }
  throw new ValidationError(`expected ${toString2()} but got ${JSON.stringify(data)}`, options);
});
Schema.extend("intersect", (data, { list, toString: toString2 }, options, strict) => {
  if (!list.length) return [data];
  let result;
  for (const inner of list) {
    const value = Schema.resolve(data, inner, options, true)[0];
    if (isNullable(value)) continue;
    if (isNullable(result)) result = value;
    else if (typeof result !== typeof value) throw new ValidationError(`expected ${toString2()} but got ${JSON.stringify(data)}`, options);
    else if (typeof value === "object") merge(result ??= {}, value);
    else if (result !== value) throw new ValidationError(`expected ${toString2()} but got ${JSON.stringify(data)}`, options);
  }
  if (!strict && isPlainObject(data)) merge(result, data);
  return [result];
});
Schema.extend("transform", (data, { inner, callback, preserve }, options) => {
  const [result, adapted = data] = Schema.resolve(data, inner, options, true);
  if (preserve) return [callback(result)];
  else return [callback(result), callback(adapted)];
});
var formatters = {};
function defineMethod(name2, keys, format) {
  formatters[name2] = format;
  Object.assign(Schema, { [name2](...args) {
    const schema = new Schema({ type: name2 });
    keys.forEach((key, index) => {
      switch (key) {
        case "sKey":
          schema.sKey = args[index] ?? Schema.string();
          break;
        case "inner":
          schema.inner = Schema.from(args[index]);
          break;
        case "list":
          schema.list = args[index].map(Schema.from);
          break;
        case "dict":
          schema.dict = mapValues(args[index], Schema.from);
          break;
        case "bits":
          schema.bits = {};
          for (const key2 in args[index]) {
            if (typeof args[index][key2] !== "number") continue;
            schema.bits[key2] = args[index][key2];
          }
          break;
        case "callback": {
          const callback = schema.callback = args[index];
          callback["toJSON"] ||= () => callback.toString();
          break;
        }
        case "constructor": {
          const constructor = schema.constructor = args[index];
          if (typeof constructor === "function") constructor["toJSON"] ||= () => constructor["name"];
          break;
        }
        default:
          schema[key] = args[index];
      }
    });
    if (name2 === "object" || name2 === "dict") schema.meta.default = {};
    else if (name2 === "array" || name2 === "tuple") schema.meta.default = [];
    else if (name2 === "bitset") schema.meta.default = 0;
    return schema;
  } });
}
defineMethod("is", ["constructor"], ({ constructor }) => {
  if (typeof constructor === "function") return constructor.name;
  else return constructor;
});
defineMethod("any", [], () => "any");
defineMethod("never", [], () => "never");
defineMethod("const", ["value"], ({ value }) => typeof value === "string" ? JSON.stringify(value) : value);
defineMethod("string", [], () => "string");
defineMethod("number", [], () => "number");
defineMethod("boolean", [], () => "boolean");
defineMethod("bitset", ["bits"], () => "bitset");
defineMethod("function", [], () => "function");
defineMethod("array", ["inner"], ({ inner }) => `${inner.toString(true)}[]`);
defineMethod("dict", ["inner", "sKey"], ({ inner, sKey }) => `{ [key: ${sKey.toString()}]: ${inner.toString()} }`);
defineMethod("tuple", ["list"], ({ list }) => `[${list.map((inner) => inner.toString()).join(", ")}]`);
defineMethod("object", ["dict"], ({ dict }) => {
  if (Object.keys(dict).length === 0) return "{}";
  return `{ ${Object.entries(dict).map(([key, inner]) => {
    return `${key}${inner.meta.required ? "" : "?"}: ${inner.toString()}`;
  }).join(", ")} }`;
});
defineMethod("union", ["list"], ({ list }, inline) => {
  const result = list.map(({ toString: format }) => format()).join(" | ");
  return inline ? `(${result})` : result;
});
defineMethod("intersect", ["list"], ({ list }) => {
  return `${list.map((inner) => inner.toString(true)).join(" & ")}`;
});
defineMethod("transform", [
  "inner",
  "callback",
  "preserve"
], ({ inner }, isInner) => inner.toString(isInner));

// src/host/segment.ts
function encodeSegment(raw) {
  if (raw.length === 0) throw new Error("cannot encode an empty path segment");
  if (raw === ".") return "~002E";
  if (raw === "..") return "~002E~002E";
  let out = "";
  for (let i = 0; i < raw.length; i++) {
    const code = raw.charCodeAt(i);
    const ch = String.fromCharCode(code);
    if (ch !== "~" && /^[A-Za-z0-9._-]$/.test(ch)) {
      out += ch;
    } else {
      out += "~" + code.toString(16).toUpperCase().padStart(4, "0");
    }
  }
  return out;
}

// src/host/trust.ts
function isLoopbackHostname(hostname) {
  if (hostname === "localhost" || hostname === "[::1]") return true;
  const parts = hostname.split(".");
  return parts.length === 4 && parts[0] === "127" && parts.every((part) => /^\d{1,3}$/.test(part) && Number(part) <= 255);
}
function header(headers, name2) {
  const value = headers[name2];
  return typeof value === "string" ? value : void 0;
}
function parseAuthority(authority, scheme = "http:") {
  try {
    return new URL(`${scheme}//${authority}`);
  } catch {
    return void 0;
  }
}
function matchesTrustedHosts(hostUrl, trustedHosts) {
  return trustedHosts.some((entry) => {
    const entryUrl = parseAuthority(entry);
    if (entryUrl === void 0) return false;
    if (entryUrl.hostname !== hostUrl.hostname) return false;
    return entryUrl.port === "" || entryUrl.port === hostUrl.port;
  });
}
function matchesBindAddress(hostUrl, bindHost) {
  if (bindHost === void 0 || bindHost === "") return false;
  const bindUrl = parseAuthority(bindHost);
  if (bindUrl === void 0) return false;
  const bindText = bindUrl.hostname.includes(":") ? `[${bindUrl.hostname}]` : bindUrl.hostname;
  return bindText === hostUrl.hostname;
}
var BATCH_HEADER = "x-dsh-session-batch-manager";
function isTrustedBatchRequest(headers, options) {
  if (header(headers, BATCH_HEADER) !== "1") return false;
  const rawHost = header(headers, "host");
  if (rawHost === void 0) return false;
  const hostUrl = parseAuthority(rawHost);
  if (hostUrl === void 0) return false;
  const hostTrusted = isLoopbackHostname(hostUrl.hostname) || matchesTrustedHosts(hostUrl, options.trustedHosts) || matchesBindAddress(hostUrl, options.bindHost);
  if (!hostTrusted) return false;
  if (header(headers, "sec-fetch-site") === "cross-site") return false;
  const origin = header(headers, "origin");
  if (origin !== void 0) {
    let originUrl;
    try {
      originUrl = new URL(origin);
    } catch {
      return false;
    }
    const scheme = originUrl.protocol === "https:" ? "https:" : originUrl.protocol === "http:" ? "http:" : void 0;
    if (scheme === void 0) return false;
    const hostUnderScheme = parseAuthority(rawHost, scheme);
    if (hostUnderScheme === void 0 || originUrl.host !== hostUnderScheme.host) return false;
  }
  return true;
}

// src/host/stats.ts
var SWEEP_THROTTLE_MS = 1e3;
var SessionStatsAggregator = class {
  constructor(ctx, concurrency) {
    this.ctx = ctx;
    this.concurrency = concurrency;
  }
  cache = /* @__PURE__ */ new Map();
  lastSweepStarted = 0;
  sweepPromise = null;
  completed = false;
  pending = 0;
  degraded = false;
  // ---- 公开 API ----
  /**
   * 触发一次 sweep（fire-and-forget）。
   *
   * 与 in-flight sweep 共享同一 Promise；节流窗内忽略重复触发。
   * 路由处理器调用此方法后应立即调用 `snapshot()` 返回当前缓存。
   */
  trigger() {
    const now = Date.now();
    if (this.sweepPromise !== null) return;
    if (now - this.lastSweepStarted < SWEEP_THROTTLE_MS) return;
    this.lastSweepStarted = now;
    this.sweepPromise = this.sweep().finally(() => {
      this.sweepPromise = null;
    });
  }
  /**
   * 返回当前缓存快照（同步）。
   *
   * 不触发任何 I/O；sweep 由 `trigger()` 在后台渐进填充缓存。
   */
  snapshot() {
    return {
      complete: this.completed,
      pending: this.pending,
      degraded: this.degraded,
      sessions: [...this.cache.values()].map((entry) => entry.row)
    };
  }
  /**
   * 触发并等待 sweep 完成（用于测试）。
   * @returns sweep 完成后的缓存快照。
   */
  async sweepAndWait() {
    this.trigger();
    if (this.sweepPromise !== null) {
      await this.sweepPromise;
    }
    return this.snapshot();
  }
  // ---- 内部 ----
  /** 全量 sweep（去重调用靠 trigger 的 promise 共享）。 */
  async sweep() {
    const query = this.ctx.get("sessionQuery");
    if (query === void 0) {
      this.degraded = true;
      this.completed = true;
      this.pending = 0;
      return;
    }
    this.degraded = false;
    let records;
    try {
      const raw = await query.listSessions();
      records = raw.map((record) => ({
        id: record.header.id,
        live: record.live
      }));
    } catch {
      this.pending = this.cache.size;
      return;
    }
    const activeIds = new Set(records.map((r) => r.id));
    for (const id of this.cache.keys()) {
      if (!activeIds.has(id)) this.cache.delete(id);
    }
    const toObserve = [];
    for (const record of records) {
      if (record.live) {
        toObserve.push(record.id);
        continue;
      }
      try {
        const stat = await this.readStat(record.id);
        if (stat === void 0) {
          this.cache.set(record.id, { revision: "", row: emptyRow(record.id) });
          continue;
        }
        const revision = stat.revision ?? "";
        const cached = this.cache.get(record.id);
        if (cached !== void 0 && cached.revision === revision) continue;
        this.cache.set(record.id, { revision, row: { id: record.id, model: null, usage: null, pressure: null, error: null } });
        toObserve.push(record.id);
      } catch {
        this.cache.set(record.id, { revision: "", row: { id: record.id, model: null, usage: null, pressure: null, error: "read-failed" } });
      }
    }
    this.pending = toObserve.length;
    this.completed = false;
    const queue = [...toObserve];
    const workers = [];
    for (let i = 0; i < Math.min(this.concurrency, queue.length); i++) {
      workers.push(this.observeWorker(query, queue));
    }
    await Promise.all(workers);
    this.pending = queue.length;
    if (this.pending === 0) this.completed = true;
  }
  /** 观察工作线程：从队列取 id 逐条观察，per-id 错误不中断队列。 */
  async observeWorker(query, queue) {
    while (queue.length > 0) {
      const id = queue.shift();
      if (id === void 0) break;
      try {
        const row = await this.observeOne(query, id);
        const existing = this.cache.get(id);
        this.cache.set(id, { revision: existing?.revision ?? "", row });
        this.pending = Math.max(0, this.pending - 1);
        if (this.pending === 0 && queue.length === 0) this.completed = true;
      } catch (error) {
        const code = error instanceof Error && error.message.includes("corrupt") ? "corrupt" : "read-failed";
        const existing = this.cache.get(id);
        this.cache.set(id, { revision: existing?.revision ?? "", row: { id, model: null, usage: null, pressure: null, error: code } });
        this.pending = Math.max(0, this.pending - 1);
        if (this.pending === 0 && queue.length === 0) this.completed = true;
      }
    }
  }
  /** 观察一个会话，抽取 stat 行。 */
  async observeOne(query, sessionId) {
    let observation;
    try {
      observation = await query.observeSession(sessionId);
    } catch (err) {
      throw new Error(`observeSession failed: ${err instanceof Error ? err.message : String(err)}`);
    }
    try {
      const usage = observation.projections?.values?.tokenUsage !== void 0 ? observation.projections.values.tokenUsage : null;
      const pressure = observation.projections?.values?.contextPressure !== void 0 ? observation.projections.values.contextPressure : null;
      const model = extractModel(observation.events ?? []);
      return { id: sessionId, model, usage, pressure, error: null };
    } finally {
      if (typeof observation.dispose === "function") {
        observation.dispose();
      } else {
        const dispose = observation[Symbol.dispose];
        if (typeof dispose === "function") dispose();
      }
    }
  }
  /** 读持久化快照的修订号。 */
  async readStat(sessionId) {
    const persistence = this.ctx.get("sessionPersistence");
    if (persistence === void 0) return void 0;
    try {
      const snapshot2 = await persistence.stat(sessionId);
      return snapshot2;
    } catch {
      throw new Error("stat failed");
    }
  }
};
function emptyRow(id) {
  return { id, model: null, usage: null, pressure: null, error: null };
}
function extractModel(events) {
  for (let i = events.length - 1; i >= 0; i--) {
    const event = events[i];
    if (event?.type === "request/header") {
      const provider = event.data?.header?.config?.provider;
      const model = event.data?.header?.config?.model;
      if (typeof provider === "string" && provider !== "" && typeof model === "string" && model !== "") {
        return `${provider}/${model}`;
      }
      return null;
    }
  }
  return null;
}

// src/host/index.ts
var name = "session-batch-manager";
var Config = Schema.object({
  routeBase: Schema.string().default("/dsh-session-batch-manager/v1"),
  maxBatchSize: Schema.number().step(1).min(1).max(1e3).default(200),
  trustedHosts: Schema.array(Schema.string()).default([]),
  statsPollIntervalMs: Schema.number().step(1).min(1e3).max(6e4).default(5e3),
  statsSweepConcurrency: Schema.number().step(1).min(1).max(16).default(4)
});
var WINDOW_CONFIG_KEY = "__DSH_SESSION_BATCH_MANAGER__";
var MAX_BODY_BYTES = 1e6;
var MAX_ID_LENGTH = 256;
function normalizeRouteBase(raw) {
  if (!raw.startsWith("/") || raw.endsWith("/") || raw.split("/").some((segment) => segment === "..")) {
    throw new Error(`session-batch-manager: routeBase ${JSON.stringify(raw)} must be an absolute path without a trailing slash or ".." segment`);
  }
  return raw;
}
function apply(ctx, config) {
  const host = ctx;
  const routeBase = normalizeRouteBase(config.routeBase);
  ctx.effect(() => host.on("webserver/index-inject", (table) => {
    table.push({ kind: "global", name: WINDOW_CONFIG_KEY, value: { routeBase, version: "0.2.0", statsPollIntervalMs: config.statsPollIntervalMs } });
  }), "session-batch-manager: index-inject");
  ctx.inject(["webServer"], (childCtx) => {
    const webServer = childCtx.get("webServer");
    if (webServer === void 0) return;
    const fence = { bindHost: webServer.host, trustedHosts: config.trustedHosts };
    const aggregator = new SessionStatsAggregator(host, config.statsSweepConcurrency);
    const disposeStatus = webServer.register({
      kind: "exact",
      path: `${routeBase}/status`,
      handler: (req, res) => {
        handleStatus(req, res);
      }
    });
    const disposeDelete = webServer.register({
      kind: "exact",
      path: `${routeBase}/delete`,
      handler: (req, res) => {
        handleDelete(host, req, res, fence, config.maxBatchSize);
      }
    });
    const disposeStats = webServer.register({
      kind: "exact",
      path: `${routeBase}/stats`,
      handler: (req, res) => {
        handleStats(req, res, aggregator);
      }
    });
    const disposeRecall = webServer.register({
      kind: "exact",
      path: `${routeBase}/recall`,
      handler: (req, res) => {
        handleRecall(host, req, res, fence, config.maxBatchSize);
      }
    });
    childCtx.effect(() => () => {
      disposeRecall();
      disposeStats();
      disposeDelete();
      disposeStatus();
    }, "session-batch-manager: web routes");
  });
}
function sendJson(res, status, value) {
  res.writeHead(status, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" });
  res.end(JSON.stringify(value));
}
function handleStatus(req, res) {
  if (req.method !== "GET") {
    sendJson(res, 405, { error: "method-not-allowed" });
    return;
  }
  sendJson(res, 200, { ok: true, service: "dsh-session-batch-manager", version: "0.2.0" });
}
function readJsonBody(req) {
  return new Promise((resolve2, reject) => {
    const chunks = [];
    let size = 0;
    req.on("data", (chunk) => {
      const buffer = typeof chunk === "string" ? Buffer.from(chunk) : chunk;
      size += buffer.length;
      if (size > MAX_BODY_BYTES) {
        reject(new Error("request body too large"));
        return;
      }
      chunks.push(buffer);
    });
    req.on("end", () => {
      try {
        resolve2(JSON.parse(Buffer.concat(chunks).toString("utf8")));
      } catch {
        reject(new Error("request body is not valid JSON"));
      }
    });
    req.on("error", reject);
  });
}
function validSessionId(value) {
  if (typeof value !== "string") return void 0;
  if (value.length === 0 || value.length > MAX_ID_LENGTH) return void 0;
  if (/[\u0000-\u001f/\\]/.test(value)) return void 0;
  return value;
}
async function handleDelete(ctx, req, res, fence, maxBatchSize) {
  try {
    if (req.method === "OPTIONS") {
      sendJson(res, 403, { error: "forbidden" });
      return;
    }
    if (req.method !== "POST") {
      sendJson(res, 405, { error: "method-not-allowed" });
      return;
    }
    if (!isTrustedBatchRequest(req.headers, fence)) {
      sendJson(res, 403, { error: "untrusted-origin" });
      return;
    }
    let body;
    try {
      body = await readJsonBody(req);
    } catch {
      sendJson(res, 400, { error: "bad-request", message: "request body must be JSON within the size limit" });
      return;
    }
    const rawIds = body?.sessionIds;
    if (!Array.isArray(rawIds) || rawIds.length === 0 || rawIds.length > maxBatchSize) {
      sendJson(res, 400, { error: "bad-request", message: `sessionIds must be a non-empty array of at most ${String(maxBatchSize)} entries` });
      return;
    }
    const ids = [...new Set(rawIds)];
    const results = [];
    for (const raw of ids) {
      const id = validSessionId(raw);
      if (id === void 0) {
        results.push({ sessionId: typeof raw === "string" ? raw.slice(0, MAX_ID_LENGTH) : String(raw), ok: false, code: "invalid-id", message: "\u4F1A\u8BDD id \u975E\u6CD5" });
        continue;
      }
      results.push(await deleteOne(ctx, id));
    }
    sendJson(res, 200, { results });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    ctx.logger?.error(`session-batch-manager: delete request failed: ${message}`);
    sendJson(res, 500, { error: "internal", message });
  }
}
async function deleteOne(ctx, sessionId) {
  const sessions = ctx.get("sessions");
  const persistence = ctx.get("sessionPersistence");
  const registry = ctx.get("workspaceRegistry");
  if (persistence === void 0) {
    return { sessionId, ok: false, code: "no-persistence", message: "\u4F1A\u8BDD\u6301\u4E45\u5316\u670D\u52A1\u4E0D\u53EF\u7528" };
  }
  try {
    const activity = await ctx.waterfall(
      "workspace/session-activity",
      { sessionId },
      () => Promise.resolve([])
    );
    if (activity.length > 0) {
      return { sessionId, ok: false, code: "active", message: "\u4F1A\u8BDD\u6709\u6B63\u5728\u8FD0\u884C\u7684\u4EFB\u52A1\uFF1B\u8BF7\u5148\u5F52\u6863\uFF08\u53EF\u505C\u6B62\u4EFB\u52A1\uFF09\u518D\u5220\u9664" };
    }
  } catch (error) {
    return { sessionId, ok: false, code: "internal", message: `\u6D3B\u52A8\u68C0\u67E5\u5931\u8D25\uFF1A${error instanceof Error ? error.message : String(error)}` };
  }
  let removedFiles = false;
  try {
    let snapshot2 = await persistence.stat(sessionId);
    if (snapshot2 !== void 0 && snapshot2.location === void 0) {
      try {
        await persistence.flush();
      } catch (error) {
        ctx.logger?.warn(`session-batch-manager: flush before deleting "${sessionId}" reported: ${error instanceof Error ? error.message : String(error)}`);
      }
      snapshot2 = await persistence.stat(sessionId);
    }
    const location = snapshot2?.location;
    if (location !== void 0) {
      if (location.kind !== "jsonl") {
        return { sessionId, ok: false, code: "unsupported-backend", message: `\u4E0D\u652F\u6301\u7684\u6301\u4E45\u5316\u540E\u7AEF\uFF1A${location.kind}` };
      }
      const dir = path.dirname(location.path);
      if (path.basename(dir) !== encodeSegment(sessionId)) {
        return { sessionId, ok: false, code: "unsafe-path", message: "\u4F1A\u8BDD\u76EE\u5F55\u540D\u4E0E\u5176 id \u4E0D\u7B26\uFF0C\u62D2\u7EDD\u5220\u9664" };
      }
      const root = typeof persistence.config?.root === "string" ? path.resolve(persistence.config.root) : void 0;
      if (root !== void 0) {
        const rel = path.relative(root, dir);
        if (rel === "" || rel.startsWith("..") || path.isAbsolute(rel)) {
          return { sessionId, ok: false, code: "unsafe-path", message: "\u4F1A\u8BDD\u76EE\u5F55\u4E0D\u5728\u6301\u4E45\u5316\u6839\u5185\uFF0C\u62D2\u7EDD\u5220\u9664" };
        }
      }
      await rm(dir, { recursive: true, force: true });
      removedFiles = true;
    }
  } catch (error) {
    return { sessionId, ok: false, code: "internal", message: `\u5220\u9664\u65E5\u5FD7\u5931\u8D25\uFF1A${error instanceof Error ? error.message : String(error)}` };
  }
  const wasLive = sessions?.get(sessionId) !== void 0;
  if (registry !== void 0) {
    try {
      if (wasLive) {
        await registry.archiveSession(sessionId);
      } else {
        if (registry.archivedSessionIds.includes(sessionId)) await registry.unarchiveSession(sessionId);
        if (registry.pinnedSessionIds.includes(sessionId)) await registry.unpinSession(sessionId);
      }
      for (const workspace of registry.list()) {
        if (workspace.sessionIds.includes(sessionId)) await workspace.detachSession(sessionId);
      }
    } catch (error) {
      ctx.logger?.warn(`session-batch-manager: registry cleanup for "${sessionId}" failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  ctx.emit("api-session/removed", sessionId);
  if (!removedFiles) {
    return { sessionId, ok: true, message: "\u4F1A\u8BDD\u5DF2\u4E0D\u5B58\u5728\uFF1B\u5DF2\u5E7F\u64AD\u6E05\u7406\u6B8B\u7559\u884C" };
  }
  return wasLive ? { sessionId, ok: true, message: "\u4F1A\u8BDD\u5DF2\u5220\u9664\uFF1B\u5BBF\u4E3B\u4ECD\u6302\u8F7D\u8BE5\u4F1A\u8BDD\uFF0C\u5217\u8868\u884C\u5DF2\u6309\u5F52\u6863\u9690\u85CF\uFF0C\u91CD\u542F\u540E\u5F7B\u5E95\u6E05\u7406" } : { sessionId, ok: true };
}
async function handleStats(req, res, aggregator) {
  if (req.method !== "GET") {
    sendJson(res, 405, { error: "method-not-allowed" });
    return;
  }
  aggregator.trigger();
  const result = aggregator.snapshot();
  sendJson(res, 200, {
    ok: true,
    service: "dsh-session-batch-manager",
    version: "0.2.0",
    generatedAt: Date.now(),
    ...result
  });
}
async function handleRecall(ctx, req, res, fence, maxBatchSize) {
  try {
    if (req.method === "OPTIONS") {
      sendJson(res, 403, { error: "forbidden" });
      return;
    }
    if (req.method !== "POST") {
      sendJson(res, 405, { error: "method-not-allowed" });
      return;
    }
    if (!isTrustedBatchRequest(req.headers, fence)) {
      sendJson(res, 403, { error: "untrusted-origin" });
      return;
    }
    let body;
    try {
      body = await readJsonBody(req);
    } catch {
      sendJson(res, 400, { error: "bad-request", message: "request body must be JSON within the size limit" });
      return;
    }
    const rawIds = body?.sessionIds;
    const cwd = body?.cwd;
    if (typeof cwd !== "string" || cwd.length === 0) {
      sendJson(res, 400, { error: "bad-request", message: "cwd must be a non-empty string" });
      return;
    }
    if (!Array.isArray(rawIds) || rawIds.length === 0 || rawIds.length > maxBatchSize) {
      sendJson(res, 400, { error: "bad-request", message: `sessionIds must be a non-empty array of at most ${String(maxBatchSize)} entries` });
      return;
    }
    const ids = [...new Set(rawIds)];
    const registry = ctx.get("workspaceRegistry");
    if (registry === void 0) {
      sendJson(res, 500, { error: "internal", message: "\u5DE5\u4F5C\u533A\u6CE8\u518C\u8868\u4E0D\u53EF\u7528" });
      return;
    }
    let workspace;
    try {
      const resolved = await registry.resolveByPath(cwd);
      if (resolved === void 0) {
        sendJson(res, 400, { error: "not-found", message: `\u672A\u627E\u5230\u5DE5\u4F5C\u533A\uFF1A${cwd}` });
        return;
      }
      workspace = resolved;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const results2 = ids.map((id) => ({
        sessionId: id,
        ok: false,
        code: "cwd-unresolvable",
        message: `\u5DE5\u4F5C\u533A\u8DEF\u5F84\u4E0D\u53EF\u89E3\u6790\uFF1A${message}`
      }));
      sendJson(res, 200, { results: results2 });
      return;
    }
    const results = [];
    for (const id of ids) {
      try {
        await workspace.attachSession(id);
        results.push({ sessionId: id, ok: true });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        let code = "attach-failed";
        if (message.includes("no cwd to validate")) code = "no-cwd";
        else if (message.includes("does not resolve")) code = "cwd-unresolvable";
        else if (message.includes("is not a directory")) code = "cwd-not-directory";
        else if (message.includes("resolves to")) code = "cwd-mismatch";
        results.push({ sessionId: id, ok: false, code, message });
      }
    }
    sendJson(res, 200, { results });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    ctx.logger?.error(`session-batch-manager: recall request failed: ${message}`);
    sendJson(res, 500, { error: "internal", message });
  }
}
export {
  Config,
  SessionStatsAggregator,
  WINDOW_CONFIG_KEY,
  apply,
  name
};
//# sourceMappingURL=index.js.map
