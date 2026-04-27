var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __commonJS = (cb, mod) => function __require() {
  return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
};
var __export = (target, all3) => {
  for (var name in all3)
    __defProp(target, name, { get: all3[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));

// node_modules/fbemitter/lib/EventSubscription.js
var require_EventSubscription = __commonJS({
  "node_modules/fbemitter/lib/EventSubscription.js"(exports, module) {
    "use strict";
    var EventSubscription = /* @__PURE__ */ (function() {
      function EventSubscription2(subscriber) {
        this.subscriber = subscriber;
      }
      var _proto = EventSubscription2.prototype;
      _proto.remove = function remove() {
        if (this.subscriber) {
          this.subscriber.removeSubscription(this);
          this.subscriber = null;
        }
      };
      return EventSubscription2;
    })();
    module.exports = EventSubscription;
  }
});

// node_modules/fbemitter/lib/EmitterSubscription.js
var require_EmitterSubscription = __commonJS({
  "node_modules/fbemitter/lib/EmitterSubscription.js"(exports, module) {
    "use strict";
    function _inheritsLoose(subClass, superClass) {
      subClass.prototype = Object.create(superClass.prototype);
      subClass.prototype.constructor = subClass;
      subClass.__proto__ = superClass;
    }
    var EventSubscription = require_EventSubscription();
    var EmitterSubscription = /* @__PURE__ */ (function(_EventSubscription) {
      _inheritsLoose(EmitterSubscription2, _EventSubscription);
      function EmitterSubscription2(subscriber, listener, context) {
        var _this;
        _this = _EventSubscription.call(this, subscriber) || this;
        _this.listener = listener;
        _this.context = context;
        return _this;
      }
      return EmitterSubscription2;
    })(EventSubscription);
    module.exports = EmitterSubscription;
  }
});

// node_modules/fbjs/lib/invariant.js
var require_invariant = __commonJS({
  "node_modules/fbjs/lib/invariant.js"(exports, module) {
    "use strict";
    var validateFormat = true ? function(format) {
      if (format === void 0) {
        throw new Error("invariant(...): Second argument must be a string.");
      }
    } : function(format) {
    };
    function invariant(condition, format) {
      for (var _len = arguments.length, args = new Array(_len > 2 ? _len - 2 : 0), _key = 2; _key < _len; _key++) {
        args[_key - 2] = arguments[_key];
      }
      validateFormat(format);
      if (!condition) {
        var error;
        if (format === void 0) {
          error = new Error("Minified exception occurred; use the non-minified dev environment for the full error message and additional helpful warnings.");
        } else {
          var argIndex = 0;
          error = new Error(format.replace(/%s/g, function() {
            return String(args[argIndex++]);
          }));
          error.name = "Invariant Violation";
        }
        error.framesToPop = 1;
        throw error;
      }
    }
    module.exports = invariant;
  }
});

// node_modules/fbemitter/lib/EventSubscriptionVendor.js
var require_EventSubscriptionVendor = __commonJS({
  "node_modules/fbemitter/lib/EventSubscriptionVendor.js"(exports, module) {
    "use strict";
    var invariant = require_invariant();
    var EventSubscriptionVendor = /* @__PURE__ */ (function() {
      function EventSubscriptionVendor2() {
        this._subscriptionsForType = {};
        this._currentSubscription = null;
      }
      var _proto = EventSubscriptionVendor2.prototype;
      _proto.addSubscription = function addSubscription(eventType, subscription) {
        !(subscription.subscriber === this) ? true ? invariant(false, "The subscriber of the subscription is incorrectly set.") : invariant(false) : void 0;
        if (!this._subscriptionsForType[eventType]) {
          this._subscriptionsForType[eventType] = [];
        }
        var key = this._subscriptionsForType[eventType].length;
        this._subscriptionsForType[eventType].push(subscription);
        subscription.eventType = eventType;
        subscription.key = key;
        return subscription;
      };
      _proto.removeAllSubscriptions = function removeAllSubscriptions(eventType) {
        if (eventType === void 0) {
          this._subscriptionsForType = {};
        } else {
          delete this._subscriptionsForType[eventType];
        }
      };
      _proto.removeSubscription = function removeSubscription(subscription) {
        var eventType = subscription.eventType;
        var key = subscription.key;
        var subscriptionsForType = this._subscriptionsForType[eventType];
        if (subscriptionsForType) {
          delete subscriptionsForType[key];
        }
      };
      _proto.getSubscriptionsForType = function getSubscriptionsForType(eventType) {
        return this._subscriptionsForType[eventType];
      };
      return EventSubscriptionVendor2;
    })();
    module.exports = EventSubscriptionVendor;
  }
});

// node_modules/fbjs/lib/emptyFunction.js
var require_emptyFunction = __commonJS({
  "node_modules/fbjs/lib/emptyFunction.js"(exports, module) {
    "use strict";
    function makeEmptyFunction(arg) {
      return function() {
        return arg;
      };
    }
    var emptyFunction = function emptyFunction2() {
    };
    emptyFunction.thatReturns = makeEmptyFunction;
    emptyFunction.thatReturnsFalse = makeEmptyFunction(false);
    emptyFunction.thatReturnsTrue = makeEmptyFunction(true);
    emptyFunction.thatReturnsNull = makeEmptyFunction(null);
    emptyFunction.thatReturnsThis = function() {
      return this;
    };
    emptyFunction.thatReturnsArgument = function(arg) {
      return arg;
    };
    module.exports = emptyFunction;
  }
});

// node_modules/fbemitter/lib/BaseEventEmitter.js
var require_BaseEventEmitter = __commonJS({
  "node_modules/fbemitter/lib/BaseEventEmitter.js"(exports, module) {
    "use strict";
    var EmitterSubscription = require_EmitterSubscription();
    var EventSubscriptionVendor = require_EventSubscriptionVendor();
    var invariant = require_invariant();
    var emptyFunction = require_emptyFunction();
    var BaseEventEmitter = /* @__PURE__ */ (function() {
      function BaseEventEmitter2() {
        this._subscriber = new EventSubscriptionVendor();
        this._currentSubscription = null;
      }
      var _proto = BaseEventEmitter2.prototype;
      _proto.addListener = function addListener(eventType, listener, context) {
        return this._subscriber.addSubscription(eventType, new EmitterSubscription(this._subscriber, listener, context));
      };
      _proto.once = function once(eventType, listener, context) {
        var emitter = this;
        return this.addListener(eventType, function() {
          emitter.removeCurrentListener();
          listener.apply(context, arguments);
        });
      };
      _proto.removeAllListeners = function removeAllListeners(eventType) {
        this._subscriber.removeAllSubscriptions(eventType);
      };
      _proto.removeCurrentListener = function removeCurrentListener() {
        !!!this._currentSubscription ? true ? invariant(false, "Not in an emitting cycle; there is no current subscription") : invariant(false) : void 0;
        this._subscriber.removeSubscription(this._currentSubscription);
      };
      _proto.listeners = function listeners(eventType) {
        var subscriptions = this._subscriber.getSubscriptionsForType(eventType);
        return subscriptions ? subscriptions.filter(emptyFunction.thatReturnsTrue).map(function(subscription) {
          return subscription.listener;
        }) : [];
      };
      _proto.emit = function emit(eventType) {
        var subscriptions = this._subscriber.getSubscriptionsForType(eventType);
        if (subscriptions) {
          var keys = Object.keys(subscriptions);
          for (var ii = 0; ii < keys.length; ii++) {
            var key = keys[ii];
            var subscription = subscriptions[key];
            if (subscription) {
              this._currentSubscription = subscription;
              this.__emitToSubscription.apply(this, [subscription].concat(Array.prototype.slice.call(arguments)));
            }
          }
          this._currentSubscription = null;
        }
      };
      _proto.__emitToSubscription = function __emitToSubscription(subscription, eventType) {
        var args = Array.prototype.slice.call(arguments, 2);
        subscription.listener.apply(subscription.context, args);
      };
      return BaseEventEmitter2;
    })();
    module.exports = BaseEventEmitter;
  }
});

// node_modules/fbemitter/index.js
var require_fbemitter = __commonJS({
  "node_modules/fbemitter/index.js"(exports, module) {
    var fbemitter = {
      EventEmitter: require_BaseEventEmitter(),
      EmitterSubscription: require_EmitterSubscription()
    };
    module.exports = fbemitter;
  }
});

// node_modules/typescript-collections/dist/lib/util.js
var require_util = __commonJS({
  "node_modules/typescript-collections/dist/lib/util.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    var _hasOwnProperty = Object.prototype.hasOwnProperty;
    exports.has = function(obj, prop) {
      return _hasOwnProperty.call(obj, prop);
    };
    function defaultCompare(a3, b2) {
      if (a3 < b2) {
        return -1;
      } else if (a3 === b2) {
        return 0;
      } else {
        return 1;
      }
    }
    exports.defaultCompare = defaultCompare;
    function defaultEquals(a3, b2) {
      return a3 === b2;
    }
    exports.defaultEquals = defaultEquals;
    function defaultToString(item) {
      if (item === null) {
        return "COLLECTION_NULL";
      } else if (isUndefined2(item)) {
        return "COLLECTION_UNDEFINED";
      } else if (isString2(item)) {
        return "$s" + item;
      } else {
        return "$o" + item.toString();
      }
    }
    exports.defaultToString = defaultToString;
    function makeString(item, join) {
      if (join === void 0) {
        join = ",";
      }
      if (item === null) {
        return "COLLECTION_NULL";
      } else if (isUndefined2(item)) {
        return "COLLECTION_UNDEFINED";
      } else if (isString2(item)) {
        return item.toString();
      } else {
        var toret = "{";
        var first = true;
        for (var prop in item) {
          if (exports.has(item, prop)) {
            if (first) {
              first = false;
            } else {
              toret = toret + join;
            }
            toret = toret + prop + ":" + item[prop];
          }
        }
        return toret + "}";
      }
    }
    exports.makeString = makeString;
    function isFunction3(func) {
      return typeof func === "function";
    }
    exports.isFunction = isFunction3;
    function isUndefined2(obj) {
      return typeof obj === "undefined";
    }
    exports.isUndefined = isUndefined2;
    function isString2(obj) {
      return Object.prototype.toString.call(obj) === "[object String]";
    }
    exports.isString = isString2;
    function reverseCompareFunction(compareFunction) {
      if (isUndefined2(compareFunction) || !isFunction3(compareFunction)) {
        return function(a3, b2) {
          if (a3 < b2) {
            return 1;
          } else if (a3 === b2) {
            return 0;
          } else {
            return -1;
          }
        };
      } else {
        return function(d3, v3) {
          return compareFunction(d3, v3) * -1;
        };
      }
    }
    exports.reverseCompareFunction = reverseCompareFunction;
    function compareToEquals(compareFunction) {
      return function(a3, b2) {
        return compareFunction(a3, b2) === 0;
      };
    }
    exports.compareToEquals = compareToEquals;
  }
});

// node_modules/typescript-collections/dist/lib/arrays.js
var require_arrays = __commonJS({
  "node_modules/typescript-collections/dist/lib/arrays.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    var util = require_util();
    function indexOf(array, item, equalsFunction) {
      var equals2 = equalsFunction || util.defaultEquals;
      var length = array.length;
      for (var i3 = 0; i3 < length; i3++) {
        if (equals2(array[i3], item)) {
          return i3;
        }
      }
      return -1;
    }
    exports.indexOf = indexOf;
    function lastIndexOf(array, item, equalsFunction) {
      var equals2 = equalsFunction || util.defaultEquals;
      var length = array.length;
      for (var i3 = length - 1; i3 >= 0; i3--) {
        if (equals2(array[i3], item)) {
          return i3;
        }
      }
      return -1;
    }
    exports.lastIndexOf = lastIndexOf;
    function contains(array, item, equalsFunction) {
      return indexOf(array, item, equalsFunction) >= 0;
    }
    exports.contains = contains;
    function remove(array, item, equalsFunction) {
      var index = indexOf(array, item, equalsFunction);
      if (index < 0) {
        return false;
      }
      array.splice(index, 1);
      return true;
    }
    exports.remove = remove;
    function frequency(array, item, equalsFunction) {
      var equals2 = equalsFunction || util.defaultEquals;
      var length = array.length;
      var freq = 0;
      for (var i3 = 0; i3 < length; i3++) {
        if (equals2(array[i3], item)) {
          freq++;
        }
      }
      return freq;
    }
    exports.frequency = frequency;
    function equals(array1, array2, equalsFunction) {
      var equals2 = equalsFunction || util.defaultEquals;
      if (array1.length !== array2.length) {
        return false;
      }
      var length = array1.length;
      for (var i3 = 0; i3 < length; i3++) {
        if (!equals2(array1[i3], array2[i3])) {
          return false;
        }
      }
      return true;
    }
    exports.equals = equals;
    function copy(array) {
      return array.concat();
    }
    exports.copy = copy;
    function swap(array, i3, j4) {
      if (i3 < 0 || i3 >= array.length || j4 < 0 || j4 >= array.length) {
        return false;
      }
      var temp = array[i3];
      array[i3] = array[j4];
      array[j4] = temp;
      return true;
    }
    exports.swap = swap;
    function toString3(array) {
      return "[" + array.toString() + "]";
    }
    exports.toString = toString3;
    function forEach2(array, callback) {
      for (var _i = 0, array_1 = array; _i < array_1.length; _i++) {
        var ele = array_1[_i];
        if (callback(ele) === false) {
          return;
        }
      }
    }
    exports.forEach = forEach2;
  }
});

// node_modules/typescript-collections/dist/lib/Dictionary.js
var require_Dictionary = __commonJS({
  "node_modules/typescript-collections/dist/lib/Dictionary.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    var util = require_util();
    var Dictionary = (
      /** @class */
      (function() {
        function Dictionary2(toStrFunction) {
          this.table = {};
          this.nElements = 0;
          this.toStr = toStrFunction || util.defaultToString;
        }
        Dictionary2.prototype.getValue = function(key) {
          var pair = this.table["$" + this.toStr(key)];
          if (util.isUndefined(pair)) {
            return void 0;
          }
          return pair.value;
        };
        Dictionary2.prototype.setValue = function(key, value) {
          if (util.isUndefined(key) || util.isUndefined(value)) {
            return void 0;
          }
          var ret;
          var k3 = "$" + this.toStr(key);
          var previousElement = this.table[k3];
          if (util.isUndefined(previousElement)) {
            this.nElements++;
            ret = void 0;
          } else {
            ret = previousElement.value;
          }
          this.table[k3] = {
            key,
            value
          };
          return ret;
        };
        Dictionary2.prototype.remove = function(key) {
          var k3 = "$" + this.toStr(key);
          var previousElement = this.table[k3];
          if (!util.isUndefined(previousElement)) {
            delete this.table[k3];
            this.nElements--;
            return previousElement.value;
          }
          return void 0;
        };
        Dictionary2.prototype.keys = function() {
          var array = [];
          for (var name_1 in this.table) {
            if (util.has(this.table, name_1)) {
              var pair = this.table[name_1];
              array.push(pair.key);
            }
          }
          return array;
        };
        Dictionary2.prototype.values = function() {
          var array = [];
          for (var name_2 in this.table) {
            if (util.has(this.table, name_2)) {
              var pair = this.table[name_2];
              array.push(pair.value);
            }
          }
          return array;
        };
        Dictionary2.prototype.forEach = function(callback) {
          for (var name_3 in this.table) {
            if (util.has(this.table, name_3)) {
              var pair = this.table[name_3];
              var ret = callback(pair.key, pair.value);
              if (ret === false) {
                return;
              }
            }
          }
        };
        Dictionary2.prototype.containsKey = function(key) {
          return !util.isUndefined(this.getValue(key));
        };
        Dictionary2.prototype.clear = function() {
          this.table = {};
          this.nElements = 0;
        };
        Dictionary2.prototype.size = function() {
          return this.nElements;
        };
        Dictionary2.prototype.isEmpty = function() {
          return this.nElements <= 0;
        };
        Dictionary2.prototype.toString = function() {
          var toret = "{";
          this.forEach(function(k3, v3) {
            toret += "\n	" + k3 + " : " + v3;
          });
          return toret + "\n}";
        };
        return Dictionary2;
      })()
    );
    exports.default = Dictionary;
  }
});

// node_modules/typescript-collections/dist/lib/Set.js
var require_Set = __commonJS({
  "node_modules/typescript-collections/dist/lib/Set.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    var util = require_util();
    var arrays = require_arrays();
    var Dictionary_1 = require_Dictionary();
    var Set2 = (
      /** @class */
      (function() {
        function Set3(toStringFunction) {
          this.dictionary = new Dictionary_1.default(toStringFunction);
        }
        Set3.prototype.contains = function(element) {
          return this.dictionary.containsKey(element);
        };
        Set3.prototype.add = function(element) {
          if (this.contains(element) || util.isUndefined(element)) {
            return false;
          } else {
            this.dictionary.setValue(element, element);
            return true;
          }
        };
        Set3.prototype.intersection = function(otherSet) {
          var set = this;
          this.forEach(function(element) {
            if (!otherSet.contains(element)) {
              set.remove(element);
            }
            return true;
          });
        };
        Set3.prototype.union = function(otherSet) {
          var set = this;
          otherSet.forEach(function(element) {
            set.add(element);
            return true;
          });
        };
        Set3.prototype.difference = function(otherSet) {
          var set = this;
          otherSet.forEach(function(element) {
            set.remove(element);
            return true;
          });
        };
        Set3.prototype.isSubsetOf = function(otherSet) {
          if (this.size() > otherSet.size()) {
            return false;
          }
          var isSub = true;
          this.forEach(function(element) {
            if (!otherSet.contains(element)) {
              isSub = false;
              return false;
            }
            return true;
          });
          return isSub;
        };
        Set3.prototype.remove = function(element) {
          if (!this.contains(element)) {
            return false;
          } else {
            this.dictionary.remove(element);
            return true;
          }
        };
        Set3.prototype.forEach = function(callback) {
          this.dictionary.forEach(function(k3, v3) {
            return callback(v3);
          });
        };
        Set3.prototype.toArray = function() {
          return this.dictionary.values();
        };
        Set3.prototype.isEmpty = function() {
          return this.dictionary.isEmpty();
        };
        Set3.prototype.size = function() {
          return this.dictionary.size();
        };
        Set3.prototype.clear = function() {
          this.dictionary.clear();
        };
        Set3.prototype.toString = function() {
          return arrays.toString(this.toArray());
        };
        return Set3;
      })()
    );
    exports.default = Set2;
  }
});

// node_modules/typescript-collections/dist/lib/Bag.js
var require_Bag = __commonJS({
  "node_modules/typescript-collections/dist/lib/Bag.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    var util = require_util();
    var Dictionary_1 = require_Dictionary();
    var Set_1 = require_Set();
    var Bag = (
      /** @class */
      (function() {
        function Bag2(toStrFunction) {
          this.toStrF = toStrFunction || util.defaultToString;
          this.dictionary = new Dictionary_1.default(this.toStrF);
          this.nElements = 0;
        }
        Bag2.prototype.add = function(element, nCopies) {
          if (nCopies === void 0) {
            nCopies = 1;
          }
          if (util.isUndefined(element) || nCopies <= 0) {
            return false;
          }
          if (!this.contains(element)) {
            var node = {
              value: element,
              copies: nCopies
            };
            this.dictionary.setValue(element, node);
          } else {
            this.dictionary.getValue(element).copies += nCopies;
          }
          this.nElements += nCopies;
          return true;
        };
        Bag2.prototype.count = function(element) {
          if (!this.contains(element)) {
            return 0;
          } else {
            return this.dictionary.getValue(element).copies;
          }
        };
        Bag2.prototype.contains = function(element) {
          return this.dictionary.containsKey(element);
        };
        Bag2.prototype.remove = function(element, nCopies) {
          if (nCopies === void 0) {
            nCopies = 1;
          }
          if (util.isUndefined(element) || nCopies <= 0) {
            return false;
          }
          if (!this.contains(element)) {
            return false;
          } else {
            var node = this.dictionary.getValue(element);
            if (nCopies > node.copies) {
              this.nElements -= node.copies;
            } else {
              this.nElements -= nCopies;
            }
            node.copies -= nCopies;
            if (node.copies <= 0) {
              this.dictionary.remove(element);
            }
            return true;
          }
        };
        Bag2.prototype.toArray = function() {
          var a3 = [];
          var values = this.dictionary.values();
          for (var _i = 0, values_1 = values; _i < values_1.length; _i++) {
            var node = values_1[_i];
            var element = node.value;
            var copies = node.copies;
            for (var j4 = 0; j4 < copies; j4++) {
              a3.push(element);
            }
          }
          return a3;
        };
        Bag2.prototype.toSet = function() {
          var toret = new Set_1.default(this.toStrF);
          var elements = this.dictionary.values();
          for (var _i = 0, elements_1 = elements; _i < elements_1.length; _i++) {
            var ele = elements_1[_i];
            var value = ele.value;
            toret.add(value);
          }
          return toret;
        };
        Bag2.prototype.forEach = function(callback) {
          this.dictionary.forEach(function(k3, v3) {
            var value = v3.value;
            var copies = v3.copies;
            for (var i3 = 0; i3 < copies; i3++) {
              if (callback(value) === false) {
                return false;
              }
            }
            return true;
          });
        };
        Bag2.prototype.size = function() {
          return this.nElements;
        };
        Bag2.prototype.isEmpty = function() {
          return this.nElements === 0;
        };
        Bag2.prototype.clear = function() {
          this.nElements = 0;
          this.dictionary.clear();
        };
        return Bag2;
      })()
    );
    exports.default = Bag;
  }
});

// node_modules/typescript-collections/dist/lib/LinkedList.js
var require_LinkedList = __commonJS({
  "node_modules/typescript-collections/dist/lib/LinkedList.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    var util = require_util();
    var arrays = require_arrays();
    var LinkedList = (
      /** @class */
      (function() {
        function LinkedList2() {
          this.firstNode = null;
          this.lastNode = null;
          this.nElements = 0;
        }
        LinkedList2.prototype.add = function(item, index) {
          if (util.isUndefined(index)) {
            index = this.nElements;
          }
          if (index < 0 || index > this.nElements || util.isUndefined(item)) {
            return false;
          }
          var newNode = this.createNode(item);
          if (this.nElements === 0 || this.lastNode === null) {
            this.firstNode = newNode;
            this.lastNode = newNode;
          } else if (index === this.nElements) {
            this.lastNode.next = newNode;
            this.lastNode = newNode;
          } else if (index === 0) {
            newNode.next = this.firstNode;
            this.firstNode = newNode;
          } else {
            var prev = this.nodeAtIndex(index - 1);
            if (prev === null) {
              return false;
            }
            newNode.next = prev.next;
            prev.next = newNode;
          }
          this.nElements++;
          return true;
        };
        LinkedList2.prototype.first = function() {
          if (this.firstNode !== null) {
            return this.firstNode.element;
          }
          return void 0;
        };
        LinkedList2.prototype.last = function() {
          if (this.lastNode !== null) {
            return this.lastNode.element;
          }
          return void 0;
        };
        LinkedList2.prototype.elementAtIndex = function(index) {
          var node = this.nodeAtIndex(index);
          if (node === null) {
            return void 0;
          }
          return node.element;
        };
        LinkedList2.prototype.indexOf = function(item, equalsFunction) {
          var equalsF = equalsFunction || util.defaultEquals;
          if (util.isUndefined(item)) {
            return -1;
          }
          var currentNode = this.firstNode;
          var index = 0;
          while (currentNode !== null) {
            if (equalsF(currentNode.element, item)) {
              return index;
            }
            index++;
            currentNode = currentNode.next;
          }
          return -1;
        };
        LinkedList2.prototype.contains = function(item, equalsFunction) {
          return this.indexOf(item, equalsFunction) >= 0;
        };
        LinkedList2.prototype.remove = function(item, equalsFunction) {
          var equalsF = equalsFunction || util.defaultEquals;
          if (this.nElements < 1 || util.isUndefined(item)) {
            return false;
          }
          var previous = null;
          var currentNode = this.firstNode;
          while (currentNode !== null) {
            if (equalsF(currentNode.element, item)) {
              if (previous === null) {
                this.firstNode = currentNode.next;
                if (currentNode === this.lastNode) {
                  this.lastNode = null;
                }
              } else if (currentNode === this.lastNode) {
                this.lastNode = previous;
                previous.next = currentNode.next;
                currentNode.next = null;
              } else {
                previous.next = currentNode.next;
                currentNode.next = null;
              }
              this.nElements--;
              return true;
            }
            previous = currentNode;
            currentNode = currentNode.next;
          }
          return false;
        };
        LinkedList2.prototype.clear = function() {
          this.firstNode = null;
          this.lastNode = null;
          this.nElements = 0;
        };
        LinkedList2.prototype.equals = function(other, equalsFunction) {
          var eqF = equalsFunction || util.defaultEquals;
          if (!(other instanceof LinkedList2)) {
            return false;
          }
          if (this.size() !== other.size()) {
            return false;
          }
          return this.equalsAux(this.firstNode, other.firstNode, eqF);
        };
        LinkedList2.prototype.equalsAux = function(n1, n2, eqF) {
          while (n1 !== null && n2 !== null) {
            if (!eqF(n1.element, n2.element)) {
              return false;
            }
            n1 = n1.next;
            n2 = n2.next;
          }
          return true;
        };
        LinkedList2.prototype.removeElementAtIndex = function(index) {
          if (index < 0 || index >= this.nElements || this.firstNode === null || this.lastNode === null) {
            return void 0;
          }
          var element;
          if (this.nElements === 1) {
            element = this.firstNode.element;
            this.firstNode = null;
            this.lastNode = null;
          } else {
            var previous = this.nodeAtIndex(index - 1);
            if (previous === null) {
              element = this.firstNode.element;
              this.firstNode = this.firstNode.next;
            } else if (previous.next === this.lastNode) {
              element = this.lastNode.element;
              this.lastNode = previous;
            }
            if (previous !== null && previous.next !== null) {
              element = previous.next.element;
              previous.next = previous.next.next;
            }
          }
          this.nElements--;
          return element;
        };
        LinkedList2.prototype.forEach = function(callback) {
          var currentNode = this.firstNode;
          while (currentNode !== null) {
            if (callback(currentNode.element) === false) {
              break;
            }
            currentNode = currentNode.next;
          }
        };
        LinkedList2.prototype.reverse = function() {
          var previous = null;
          var current = this.firstNode;
          var temp = null;
          while (current !== null) {
            temp = current.next;
            current.next = previous;
            previous = current;
            current = temp;
          }
          temp = this.firstNode;
          this.firstNode = this.lastNode;
          this.lastNode = temp;
        };
        LinkedList2.prototype.toArray = function() {
          var array = [];
          var currentNode = this.firstNode;
          while (currentNode !== null) {
            array.push(currentNode.element);
            currentNode = currentNode.next;
          }
          return array;
        };
        LinkedList2.prototype.size = function() {
          return this.nElements;
        };
        LinkedList2.prototype.isEmpty = function() {
          return this.nElements <= 0;
        };
        LinkedList2.prototype.toString = function() {
          return arrays.toString(this.toArray());
        };
        LinkedList2.prototype.nodeAtIndex = function(index) {
          if (index < 0 || index >= this.nElements) {
            return null;
          }
          if (index === this.nElements - 1) {
            return this.lastNode;
          }
          var node = this.firstNode;
          for (var i3 = 0; i3 < index && node !== null; i3++) {
            node = node.next;
          }
          return node;
        };
        LinkedList2.prototype.createNode = function(item) {
          return {
            element: item,
            next: null
          };
        };
        return LinkedList2;
      })()
    );
    exports.default = LinkedList;
  }
});

// node_modules/typescript-collections/dist/lib/Queue.js
var require_Queue = __commonJS({
  "node_modules/typescript-collections/dist/lib/Queue.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    var LinkedList_1 = require_LinkedList();
    var Queue2 = (
      /** @class */
      (function() {
        function Queue3() {
          this.list = new LinkedList_1.default();
        }
        Queue3.prototype.enqueue = function(elem) {
          return this.list.add(elem);
        };
        Queue3.prototype.add = function(elem) {
          return this.list.add(elem);
        };
        Queue3.prototype.dequeue = function() {
          if (this.list.size() !== 0) {
            var el = this.list.first();
            this.list.removeElementAtIndex(0);
            return el;
          }
          return void 0;
        };
        Queue3.prototype.peek = function() {
          if (this.list.size() !== 0) {
            return this.list.first();
          }
          return void 0;
        };
        Queue3.prototype.size = function() {
          return this.list.size();
        };
        Queue3.prototype.contains = function(elem, equalsFunction) {
          return this.list.contains(elem, equalsFunction);
        };
        Queue3.prototype.isEmpty = function() {
          return this.list.size() <= 0;
        };
        Queue3.prototype.clear = function() {
          this.list.clear();
        };
        Queue3.prototype.forEach = function(callback) {
          this.list.forEach(callback);
        };
        return Queue3;
      })()
    );
    exports.default = Queue2;
  }
});

// node_modules/typescript-collections/dist/lib/BSTreeKV.js
var require_BSTreeKV = __commonJS({
  "node_modules/typescript-collections/dist/lib/BSTreeKV.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    var util = require_util();
    var Queue_1 = require_Queue();
    var BSTreeKV = (
      /** @class */
      (function() {
        function BSTreeKV2(compareFunction) {
          this.root = null;
          this.compare = compareFunction || util.defaultCompare;
          this.nElements = 0;
        }
        BSTreeKV2.prototype.add = function(element) {
          if (util.isUndefined(element)) {
            return false;
          }
          if (this.insertNode(this.createNode(element)) !== null) {
            this.nElements++;
            return true;
          }
          return false;
        };
        BSTreeKV2.prototype.clear = function() {
          this.root = null;
          this.nElements = 0;
        };
        BSTreeKV2.prototype.isEmpty = function() {
          return this.nElements === 0;
        };
        BSTreeKV2.prototype.size = function() {
          return this.nElements;
        };
        BSTreeKV2.prototype.contains = function(element) {
          if (util.isUndefined(element)) {
            return false;
          }
          return this.searchNode(this.root, element) !== null;
        };
        BSTreeKV2.prototype.search = function(element) {
          var ret = this.searchNode(this.root, element);
          if (ret === null) {
            return void 0;
          }
          return ret.element;
        };
        BSTreeKV2.prototype.remove = function(element) {
          var node = this.searchNode(this.root, element);
          if (node === null) {
            return false;
          }
          this.removeNode(node);
          this.nElements--;
          return true;
        };
        BSTreeKV2.prototype.inorderTraversal = function(callback) {
          this.inorderTraversalAux(this.root, callback, {
            stop: false
          });
        };
        BSTreeKV2.prototype.preorderTraversal = function(callback) {
          this.preorderTraversalAux(this.root, callback, {
            stop: false
          });
        };
        BSTreeKV2.prototype.postorderTraversal = function(callback) {
          this.postorderTraversalAux(this.root, callback, {
            stop: false
          });
        };
        BSTreeKV2.prototype.levelTraversal = function(callback) {
          this.levelTraversalAux(this.root, callback);
        };
        BSTreeKV2.prototype.minimum = function() {
          if (this.isEmpty() || this.root === null) {
            return void 0;
          }
          return this.minimumAux(this.root).element;
        };
        BSTreeKV2.prototype.maximum = function() {
          if (this.isEmpty() || this.root === null) {
            return void 0;
          }
          return this.maximumAux(this.root).element;
        };
        BSTreeKV2.prototype.forEach = function(callback) {
          this.inorderTraversal(callback);
        };
        BSTreeKV2.prototype.toArray = function() {
          var array = [];
          this.inorderTraversal(function(element) {
            array.push(element);
            return true;
          });
          return array;
        };
        BSTreeKV2.prototype.height = function() {
          return this.heightAux(this.root);
        };
        BSTreeKV2.prototype.searchNode = function(node, element) {
          var cmp = 1;
          while (node !== null && cmp !== 0) {
            cmp = this.compare(element, node.element);
            if (cmp < 0) {
              node = node.leftCh;
            } else if (cmp > 0) {
              node = node.rightCh;
            }
          }
          return node;
        };
        BSTreeKV2.prototype.transplant = function(n1, n2) {
          if (n1.parent === null) {
            this.root = n2;
          } else if (n1 === n1.parent.leftCh) {
            n1.parent.leftCh = n2;
          } else {
            n1.parent.rightCh = n2;
          }
          if (n2 !== null) {
            n2.parent = n1.parent;
          }
        };
        BSTreeKV2.prototype.removeNode = function(node) {
          if (node.leftCh === null) {
            this.transplant(node, node.rightCh);
          } else if (node.rightCh === null) {
            this.transplant(node, node.leftCh);
          } else {
            var y3 = this.minimumAux(node.rightCh);
            if (y3.parent !== node) {
              this.transplant(y3, y3.rightCh);
              y3.rightCh = node.rightCh;
              y3.rightCh.parent = y3;
            }
            this.transplant(node, y3);
            y3.leftCh = node.leftCh;
            y3.leftCh.parent = y3;
          }
        };
        BSTreeKV2.prototype.inorderTraversalAux = function(node, callback, signal) {
          if (node === null || signal.stop) {
            return;
          }
          this.inorderTraversalAux(node.leftCh, callback, signal);
          if (signal.stop) {
            return;
          }
          signal.stop = callback(node.element) === false;
          if (signal.stop) {
            return;
          }
          this.inorderTraversalAux(node.rightCh, callback, signal);
        };
        BSTreeKV2.prototype.levelTraversalAux = function(node, callback) {
          var queue = new Queue_1.default();
          if (node !== null) {
            queue.enqueue(node);
          }
          node = queue.dequeue() || null;
          while (node != null) {
            if (callback(node.element) === false) {
              return;
            }
            if (node.leftCh !== null) {
              queue.enqueue(node.leftCh);
            }
            if (node.rightCh !== null) {
              queue.enqueue(node.rightCh);
            }
            node = queue.dequeue() || null;
          }
        };
        BSTreeKV2.prototype.preorderTraversalAux = function(node, callback, signal) {
          if (node === null || signal.stop) {
            return;
          }
          signal.stop = callback(node.element) === false;
          if (signal.stop) {
            return;
          }
          this.preorderTraversalAux(node.leftCh, callback, signal);
          if (signal.stop) {
            return;
          }
          this.preorderTraversalAux(node.rightCh, callback, signal);
        };
        BSTreeKV2.prototype.postorderTraversalAux = function(node, callback, signal) {
          if (node === null || signal.stop) {
            return;
          }
          this.postorderTraversalAux(node.leftCh, callback, signal);
          if (signal.stop) {
            return;
          }
          this.postorderTraversalAux(node.rightCh, callback, signal);
          if (signal.stop) {
            return;
          }
          signal.stop = callback(node.element) === false;
        };
        BSTreeKV2.prototype.minimumAux = function(node) {
          while (node != null && node.leftCh !== null) {
            node = node.leftCh;
          }
          return node;
        };
        BSTreeKV2.prototype.maximumAux = function(node) {
          while (node != null && node.rightCh !== null) {
            node = node.rightCh;
          }
          return node;
        };
        BSTreeKV2.prototype.heightAux = function(node) {
          if (node === null) {
            return -1;
          }
          return Math.max(this.heightAux(node.leftCh), this.heightAux(node.rightCh)) + 1;
        };
        BSTreeKV2.prototype.insertNode = function(node) {
          var parent = null;
          var position = this.root;
          while (position !== null) {
            var cmp = this.compare(node.element, position.element);
            if (cmp === 0) {
              return null;
            } else if (cmp < 0) {
              parent = position;
              position = position.leftCh;
            } else {
              parent = position;
              position = position.rightCh;
            }
          }
          node.parent = parent;
          if (parent === null) {
            this.root = node;
          } else if (this.compare(node.element, parent.element) < 0) {
            parent.leftCh = node;
          } else {
            parent.rightCh = node;
          }
          return node;
        };
        BSTreeKV2.prototype.createNode = function(element) {
          return {
            element,
            leftCh: null,
            rightCh: null,
            parent: null
          };
        };
        return BSTreeKV2;
      })()
    );
    exports.default = BSTreeKV;
  }
});

// node_modules/typescript-collections/dist/lib/BSTree.js
var require_BSTree = __commonJS({
  "node_modules/typescript-collections/dist/lib/BSTree.js"(exports) {
    "use strict";
    var __extends = exports && exports.__extends || (function() {
      var extendStatics = Object.setPrototypeOf || { __proto__: [] } instanceof Array && function(d3, b2) {
        d3.__proto__ = b2;
      } || function(d3, b2) {
        for (var p3 in b2) if (b2.hasOwnProperty(p3)) d3[p3] = b2[p3];
      };
      return function(d3, b2) {
        extendStatics(d3, b2);
        function __() {
          this.constructor = d3;
        }
        d3.prototype = b2 === null ? Object.create(b2) : (__.prototype = b2.prototype, new __());
      };
    })();
    Object.defineProperty(exports, "__esModule", { value: true });
    var BSTreeKV_1 = require_BSTreeKV();
    var BSTree = (
      /** @class */
      (function(_super) {
        __extends(BSTree2, _super);
        function BSTree2() {
          return _super !== null && _super.apply(this, arguments) || this;
        }
        return BSTree2;
      })(BSTreeKV_1.default)
    );
    exports.default = BSTree;
  }
});

// node_modules/typescript-collections/dist/lib/Heap.js
var require_Heap = __commonJS({
  "node_modules/typescript-collections/dist/lib/Heap.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    var collections = require_util();
    var arrays = require_arrays();
    var Heap = (
      /** @class */
      (function() {
        function Heap2(compareFunction) {
          this.data = [];
          this.compare = compareFunction || collections.defaultCompare;
        }
        Heap2.prototype.leftChildIndex = function(nodeIndex) {
          return 2 * nodeIndex + 1;
        };
        Heap2.prototype.rightChildIndex = function(nodeIndex) {
          return 2 * nodeIndex + 2;
        };
        Heap2.prototype.parentIndex = function(nodeIndex) {
          return Math.floor((nodeIndex - 1) / 2);
        };
        Heap2.prototype.minIndex = function(leftChild, rightChild) {
          if (rightChild >= this.data.length) {
            if (leftChild >= this.data.length) {
              return -1;
            } else {
              return leftChild;
            }
          } else {
            if (this.compare(this.data[leftChild], this.data[rightChild]) <= 0) {
              return leftChild;
            } else {
              return rightChild;
            }
          }
        };
        Heap2.prototype.siftUp = function(index) {
          var parent = this.parentIndex(index);
          while (index > 0 && this.compare(this.data[parent], this.data[index]) > 0) {
            arrays.swap(this.data, parent, index);
            index = parent;
            parent = this.parentIndex(index);
          }
        };
        Heap2.prototype.siftDown = function(nodeIndex) {
          var min = this.minIndex(this.leftChildIndex(nodeIndex), this.rightChildIndex(nodeIndex));
          while (min >= 0 && this.compare(this.data[nodeIndex], this.data[min]) > 0) {
            arrays.swap(this.data, min, nodeIndex);
            nodeIndex = min;
            min = this.minIndex(this.leftChildIndex(nodeIndex), this.rightChildIndex(nodeIndex));
          }
        };
        Heap2.prototype.peek = function() {
          if (this.data.length > 0) {
            return this.data[0];
          } else {
            return void 0;
          }
        };
        Heap2.prototype.add = function(element) {
          if (collections.isUndefined(element)) {
            return false;
          }
          this.data.push(element);
          this.siftUp(this.data.length - 1);
          return true;
        };
        Heap2.prototype.removeRoot = function() {
          if (this.data.length > 0) {
            var obj = this.data[0];
            this.data[0] = this.data[this.data.length - 1];
            this.data.splice(this.data.length - 1, 1);
            if (this.data.length > 0) {
              this.siftDown(0);
            }
            return obj;
          }
          return void 0;
        };
        Heap2.prototype.contains = function(element) {
          var equF = collections.compareToEquals(this.compare);
          return arrays.contains(this.data, element, equF);
        };
        Heap2.prototype.size = function() {
          return this.data.length;
        };
        Heap2.prototype.isEmpty = function() {
          return this.data.length <= 0;
        };
        Heap2.prototype.clear = function() {
          this.data.length = 0;
        };
        Heap2.prototype.forEach = function(callback) {
          arrays.forEach(this.data, callback);
        };
        return Heap2;
      })()
    );
    exports.default = Heap;
  }
});

// node_modules/typescript-collections/dist/lib/LinkedDictionary.js
var require_LinkedDictionary = __commonJS({
  "node_modules/typescript-collections/dist/lib/LinkedDictionary.js"(exports) {
    "use strict";
    var __extends = exports && exports.__extends || (function() {
      var extendStatics = Object.setPrototypeOf || { __proto__: [] } instanceof Array && function(d3, b2) {
        d3.__proto__ = b2;
      } || function(d3, b2) {
        for (var p3 in b2) if (b2.hasOwnProperty(p3)) d3[p3] = b2[p3];
      };
      return function(d3, b2) {
        extendStatics(d3, b2);
        function __() {
          this.constructor = d3;
        }
        d3.prototype = b2 === null ? Object.create(b2) : (__.prototype = b2.prototype, new __());
      };
    })();
    Object.defineProperty(exports, "__esModule", { value: true });
    var Dictionary_1 = require_Dictionary();
    var util = require_util();
    var LinkedDictionaryPair = (
      /** @class */
      (function() {
        function LinkedDictionaryPair2(key, value) {
          this.key = key;
          this.value = value;
        }
        LinkedDictionaryPair2.prototype.unlink = function() {
          this.prev.next = this.next;
          this.next.prev = this.prev;
        };
        return LinkedDictionaryPair2;
      })()
    );
    var HeadOrTailLinkedDictionaryPair = (
      /** @class */
      (function() {
        function HeadOrTailLinkedDictionaryPair2() {
          this.key = null;
          this.value = null;
        }
        HeadOrTailLinkedDictionaryPair2.prototype.unlink = function() {
          this.prev.next = this.next;
          this.next.prev = this.prev;
        };
        return HeadOrTailLinkedDictionaryPair2;
      })()
    );
    function isHeadOrTailLinkedDictionaryPair(p3) {
      return !p3.next;
    }
    var LinkedDictionary = (
      /** @class */
      (function(_super) {
        __extends(LinkedDictionary2, _super);
        function LinkedDictionary2(toStrFunction) {
          var _this = _super.call(this, toStrFunction) || this;
          _this.head = new HeadOrTailLinkedDictionaryPair();
          _this.tail = new HeadOrTailLinkedDictionaryPair();
          _this.head.next = _this.tail;
          _this.tail.prev = _this.head;
          return _this;
        }
        LinkedDictionary2.prototype.appendToTail = function(entry) {
          var lastNode = this.tail.prev;
          lastNode.next = entry;
          entry.prev = lastNode;
          entry.next = this.tail;
          this.tail.prev = entry;
        };
        LinkedDictionary2.prototype.getLinkedDictionaryPair = function(key) {
          if (util.isUndefined(key)) {
            return void 0;
          }
          var k3 = "$" + this.toStr(key);
          var pair = this.table[k3];
          return pair;
        };
        LinkedDictionary2.prototype.getValue = function(key) {
          var pair = this.getLinkedDictionaryPair(key);
          if (!util.isUndefined(pair)) {
            return pair.value;
          }
          return void 0;
        };
        LinkedDictionary2.prototype.remove = function(key) {
          var pair = this.getLinkedDictionaryPair(key);
          if (!util.isUndefined(pair)) {
            _super.prototype.remove.call(this, key);
            pair.unlink();
            return pair.value;
          }
          return void 0;
        };
        LinkedDictionary2.prototype.clear = function() {
          _super.prototype.clear.call(this);
          this.head.next = this.tail;
          this.tail.prev = this.head;
        };
        LinkedDictionary2.prototype.replace = function(oldPair, newPair) {
          var k3 = "$" + this.toStr(newPair.key);
          newPair.next = oldPair.next;
          newPair.prev = oldPair.prev;
          this.remove(oldPair.key);
          newPair.prev.next = newPair;
          newPair.next.prev = newPair;
          this.table[k3] = newPair;
          ++this.nElements;
        };
        LinkedDictionary2.prototype.setValue = function(key, value) {
          if (util.isUndefined(key) || util.isUndefined(value)) {
            return void 0;
          }
          var existingPair = this.getLinkedDictionaryPair(key);
          var newPair = new LinkedDictionaryPair(key, value);
          var k3 = "$" + this.toStr(key);
          if (!util.isUndefined(existingPair)) {
            this.replace(existingPair, newPair);
            return existingPair.value;
          } else {
            this.appendToTail(newPair);
            this.table[k3] = newPair;
            ++this.nElements;
            return void 0;
          }
        };
        LinkedDictionary2.prototype.keys = function() {
          var array = [];
          this.forEach(function(key, value) {
            array.push(key);
          });
          return array;
        };
        LinkedDictionary2.prototype.values = function() {
          var array = [];
          this.forEach(function(key, value) {
            array.push(value);
          });
          return array;
        };
        LinkedDictionary2.prototype.forEach = function(callback) {
          var crawlNode = this.head.next;
          while (!isHeadOrTailLinkedDictionaryPair(crawlNode)) {
            var ret = callback(crawlNode.key, crawlNode.value);
            if (ret === false) {
              return;
            }
            crawlNode = crawlNode.next;
          }
        };
        return LinkedDictionary2;
      })(Dictionary_1.default)
    );
    exports.default = LinkedDictionary;
  }
});

// node_modules/typescript-collections/dist/lib/MultiDictionary.js
var require_MultiDictionary = __commonJS({
  "node_modules/typescript-collections/dist/lib/MultiDictionary.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    var util = require_util();
    var Dictionary_1 = require_Dictionary();
    var arrays = require_arrays();
    var MultiDictionary = (
      /** @class */
      (function() {
        function MultiDictionary2(toStrFunction, valuesEqualsFunction, allowDuplicateValues) {
          if (allowDuplicateValues === void 0) {
            allowDuplicateValues = false;
          }
          this.dict = new Dictionary_1.default(toStrFunction);
          this.equalsF = valuesEqualsFunction || util.defaultEquals;
          this.allowDuplicate = allowDuplicateValues;
        }
        MultiDictionary2.prototype.getValue = function(key) {
          var values = this.dict.getValue(key);
          if (util.isUndefined(values)) {
            return [];
          }
          return arrays.copy(values);
        };
        MultiDictionary2.prototype.setValue = function(key, value) {
          if (util.isUndefined(key) || util.isUndefined(value)) {
            return false;
          }
          var array = this.dict.getValue(key);
          if (util.isUndefined(array)) {
            this.dict.setValue(key, [value]);
            return true;
          }
          if (!this.allowDuplicate) {
            if (arrays.contains(array, value, this.equalsF)) {
              return false;
            }
          }
          array.push(value);
          return true;
        };
        MultiDictionary2.prototype.remove = function(key, value) {
          if (util.isUndefined(value)) {
            var v3 = this.dict.remove(key);
            return !util.isUndefined(v3);
          }
          var array = this.dict.getValue(key);
          if (!util.isUndefined(array) && arrays.remove(array, value, this.equalsF)) {
            if (array.length === 0) {
              this.dict.remove(key);
            }
            return true;
          }
          return false;
        };
        MultiDictionary2.prototype.keys = function() {
          return this.dict.keys();
        };
        MultiDictionary2.prototype.values = function() {
          var values = this.dict.values();
          var array = [];
          for (var _i = 0, values_1 = values; _i < values_1.length; _i++) {
            var v3 = values_1[_i];
            for (var _a = 0, v_1 = v3; _a < v_1.length; _a++) {
              var w3 = v_1[_a];
              array.push(w3);
            }
          }
          return array;
        };
        MultiDictionary2.prototype.containsKey = function(key) {
          return this.dict.containsKey(key);
        };
        MultiDictionary2.prototype.clear = function() {
          this.dict.clear();
        };
        MultiDictionary2.prototype.size = function() {
          return this.dict.size();
        };
        MultiDictionary2.prototype.isEmpty = function() {
          return this.dict.isEmpty();
        };
        return MultiDictionary2;
      })()
    );
    exports.default = MultiDictionary;
  }
});

// node_modules/typescript-collections/dist/lib/FactoryDictionary.js
var require_FactoryDictionary = __commonJS({
  "node_modules/typescript-collections/dist/lib/FactoryDictionary.js"(exports) {
    "use strict";
    var __extends = exports && exports.__extends || (function() {
      var extendStatics = Object.setPrototypeOf || { __proto__: [] } instanceof Array && function(d3, b2) {
        d3.__proto__ = b2;
      } || function(d3, b2) {
        for (var p3 in b2) if (b2.hasOwnProperty(p3)) d3[p3] = b2[p3];
      };
      return function(d3, b2) {
        extendStatics(d3, b2);
        function __() {
          this.constructor = d3;
        }
        d3.prototype = b2 === null ? Object.create(b2) : (__.prototype = b2.prototype, new __());
      };
    })();
    Object.defineProperty(exports, "__esModule", { value: true });
    var Dictionary_1 = require_Dictionary();
    var util = require_util();
    var FactoryDictionary = (
      /** @class */
      (function(_super) {
        __extends(FactoryDictionary2, _super);
        function FactoryDictionary2(defaultFactoryFunction, toStrFunction) {
          var _this = _super.call(this, toStrFunction) || this;
          _this.defaultFactoryFunction = defaultFactoryFunction;
          return _this;
        }
        FactoryDictionary2.prototype.setDefault = function(key, defaultValue) {
          var currentValue = _super.prototype.getValue.call(this, key);
          if (util.isUndefined(currentValue)) {
            this.setValue(key, defaultValue);
            return defaultValue;
          }
          return currentValue;
        };
        FactoryDictionary2.prototype.getValue = function(key) {
          return this.setDefault(key, this.defaultFactoryFunction());
        };
        return FactoryDictionary2;
      })(Dictionary_1.default)
    );
    exports.default = FactoryDictionary;
  }
});

// node_modules/typescript-collections/dist/lib/PriorityQueue.js
var require_PriorityQueue = __commonJS({
  "node_modules/typescript-collections/dist/lib/PriorityQueue.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    var util = require_util();
    var Heap_1 = require_Heap();
    var PriorityQueue2 = (
      /** @class */
      (function() {
        function PriorityQueue3(compareFunction) {
          this.heap = new Heap_1.default(util.reverseCompareFunction(compareFunction));
        }
        PriorityQueue3.prototype.enqueue = function(element) {
          return this.heap.add(element);
        };
        PriorityQueue3.prototype.add = function(element) {
          return this.heap.add(element);
        };
        PriorityQueue3.prototype.dequeue = function() {
          if (this.heap.size() !== 0) {
            var el = this.heap.peek();
            this.heap.removeRoot();
            return el;
          }
          return void 0;
        };
        PriorityQueue3.prototype.peek = function() {
          return this.heap.peek();
        };
        PriorityQueue3.prototype.contains = function(element) {
          return this.heap.contains(element);
        };
        PriorityQueue3.prototype.isEmpty = function() {
          return this.heap.isEmpty();
        };
        PriorityQueue3.prototype.size = function() {
          return this.heap.size();
        };
        PriorityQueue3.prototype.clear = function() {
          this.heap.clear();
        };
        PriorityQueue3.prototype.forEach = function(callback) {
          this.heap.forEach(callback);
        };
        return PriorityQueue3;
      })()
    );
    exports.default = PriorityQueue2;
  }
});

// node_modules/typescript-collections/dist/lib/Stack.js
var require_Stack = __commonJS({
  "node_modules/typescript-collections/dist/lib/Stack.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    var LinkedList_1 = require_LinkedList();
    var Stack = (
      /** @class */
      (function() {
        function Stack2() {
          this.list = new LinkedList_1.default();
        }
        Stack2.prototype.push = function(elem) {
          return this.list.add(elem, 0);
        };
        Stack2.prototype.add = function(elem) {
          return this.list.add(elem, 0);
        };
        Stack2.prototype.pop = function() {
          return this.list.removeElementAtIndex(0);
        };
        Stack2.prototype.peek = function() {
          return this.list.first();
        };
        Stack2.prototype.size = function() {
          return this.list.size();
        };
        Stack2.prototype.contains = function(elem, equalsFunction) {
          return this.list.contains(elem, equalsFunction);
        };
        Stack2.prototype.isEmpty = function() {
          return this.list.isEmpty();
        };
        Stack2.prototype.clear = function() {
          this.list.clear();
        };
        Stack2.prototype.forEach = function(callback) {
          this.list.forEach(callback);
        };
        return Stack2;
      })()
    );
    exports.default = Stack;
  }
});

// node_modules/typescript-collections/dist/lib/MultiRootTree.js
var require_MultiRootTree = __commonJS({
  "node_modules/typescript-collections/dist/lib/MultiRootTree.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    var Direction;
    (function(Direction2) {
      Direction2[Direction2["BEFORE"] = 0] = "BEFORE";
      Direction2[Direction2["AFTER"] = 1] = "AFTER";
      Direction2[Direction2["INSIDE_AT_END"] = 2] = "INSIDE_AT_END";
      Direction2[Direction2["INSIDE_AT_START"] = 3] = "INSIDE_AT_START";
    })(Direction || (Direction = {}));
    var MultiRootTree = (
      /** @class */
      (function() {
        function MultiRootTree2(rootIds, nodes) {
          if (rootIds === void 0) {
            rootIds = [];
          }
          if (nodes === void 0) {
            nodes = {};
          }
          this.rootIds = rootIds;
          this.nodes = nodes;
          this.initRootIds();
          this.initNodes();
        }
        MultiRootTree2.prototype.initRootIds = function() {
          for (var _i = 0, _a = this.rootIds; _i < _a.length; _i++) {
            var rootId = _a[_i];
            this.createEmptyNodeIfNotExist(rootId);
          }
        };
        MultiRootTree2.prototype.initNodes = function() {
          for (var nodeKey in this.nodes) {
            if (this.nodes.hasOwnProperty(nodeKey)) {
              for (var _i = 0, _a = this.nodes[nodeKey]; _i < _a.length; _i++) {
                var nodeListItem = _a[_i];
                this.createEmptyNodeIfNotExist(nodeListItem);
              }
            }
          }
        };
        MultiRootTree2.prototype.createEmptyNodeIfNotExist = function(nodeKey) {
          if (!this.nodes[nodeKey]) {
            this.nodes[nodeKey] = [];
          }
        };
        MultiRootTree2.prototype.getRootIds = function() {
          var clone = this.rootIds.slice();
          return clone;
        };
        MultiRootTree2.prototype.getNodes = function() {
          var clone = {};
          for (var nodeKey in this.nodes) {
            if (this.nodes.hasOwnProperty(nodeKey)) {
              clone[nodeKey] = this.nodes[nodeKey].slice();
            }
          }
          return clone;
        };
        MultiRootTree2.prototype.getObject = function() {
          return {
            rootIds: this.getRootIds(),
            nodes: this.getNodes()
          };
        };
        MultiRootTree2.prototype.toObject = function() {
          return this.getObject();
        };
        MultiRootTree2.prototype.flatten = function() {
          var _this = this;
          var extraPropsObject = [];
          for (var i3 = 0; i3 < this.rootIds.length; i3++) {
            var rootId = this.rootIds[i3];
            extraPropsObject.push({
              id: rootId,
              level: 0,
              hasParent: false,
              childrenCount: 0
            });
            traverse(rootId, this.nodes, extraPropsObject, 0);
          }
          for (var _i = 0, extraPropsObject_1 = extraPropsObject; _i < extraPropsObject_1.length; _i++) {
            var o3 = extraPropsObject_1[_i];
            o3.childrenCount = countChildren(o3.id);
          }
          return extraPropsObject;
          function countChildren(id) {
            if (!_this.nodes[id]) {
              return 0;
            } else {
              var childrenCount = _this.nodes[id].length;
              return childrenCount;
            }
          }
          function traverse(startId, nodes, returnArray, level) {
            if (level === void 0) {
              level = 0;
            }
            if (!startId || !nodes || !returnArray || !nodes[startId]) {
              return;
            }
            level++;
            var idsList = nodes[startId];
            for (var i4 = 0; i4 < idsList.length; i4++) {
              var id = idsList[i4];
              returnArray.push({ id, level, hasParent: true });
              traverse(id, nodes, returnArray, level);
            }
            level--;
          }
        };
        MultiRootTree2.prototype.moveIdBeforeId = function(moveId, beforeId) {
          return this.moveId(moveId, beforeId, Direction.BEFORE);
        };
        MultiRootTree2.prototype.moveIdAfterId = function(moveId, afterId) {
          return this.moveId(moveId, afterId, Direction.AFTER);
        };
        MultiRootTree2.prototype.moveIdIntoId = function(moveId, insideId, atStart) {
          if (atStart === void 0) {
            atStart = true;
          }
          if (atStart) {
            return this.moveId(moveId, insideId, Direction.INSIDE_AT_START);
          } else {
            return this.moveId(moveId, insideId, Direction.INSIDE_AT_END);
          }
        };
        MultiRootTree2.prototype.swapRootIdWithRootId = function(rootId, withRootId) {
          var leftIndex = this.findRootId(rootId);
          var rightIndex = this.findRootId(withRootId);
          this.swapRootPositionWithRootPosition(leftIndex, rightIndex);
        };
        MultiRootTree2.prototype.swapRootPositionWithRootPosition = function(swapRootPosition, withRootPosition) {
          var temp = this.rootIds[withRootPosition];
          this.rootIds[withRootPosition] = this.rootIds[swapRootPosition];
          this.rootIds[swapRootPosition] = temp;
        };
        MultiRootTree2.prototype.deleteId = function(id) {
          this.rootDeleteId(id);
          this.nodeAndSubNodesDelete(id);
          this.nodeRefrencesDelete(id);
        };
        MultiRootTree2.prototype.insertIdBeforeId = function(beforeId, insertId) {
          var foundRootIdIndex = this.findRootId(beforeId);
          if (foundRootIdIndex > -1) {
            this.insertIdIntoRoot(insertId, foundRootIdIndex);
          }
          for (var nodeKey in this.nodes) {
            if (this.nodes.hasOwnProperty(nodeKey)) {
              var foundNodeIdIndex = this.findNodeId(nodeKey, beforeId);
              if (foundNodeIdIndex > -1) {
                this.insertIdIntoNode(nodeKey, insertId, foundNodeIdIndex);
              }
            }
          }
        };
        MultiRootTree2.prototype.insertIdAfterId = function(belowId, insertId) {
          var foundRootIdIndex = this.findRootId(belowId);
          if (foundRootIdIndex > -1) {
            this.insertIdIntoRoot(insertId, foundRootIdIndex + 1);
          }
          for (var nodeKey in this.nodes) {
            if (this.nodes.hasOwnProperty(nodeKey)) {
              var foundNodeIdIndex = this.findNodeId(nodeKey, belowId);
              if (foundNodeIdIndex > -1) {
                this.insertIdIntoNode(nodeKey, insertId, foundNodeIdIndex + 1);
              }
            }
          }
        };
        MultiRootTree2.prototype.insertIdIntoId = function(insideId, insertId) {
          this.nodeInsertAtEnd(insideId, insertId);
          this.nodes[insertId] = [];
        };
        MultiRootTree2.prototype.insertIdIntoRoot = function(id, position) {
          if (position === void 0) {
            this.rootInsertAtEnd(id);
          } else {
            if (position < 0) {
              var length_1 = this.rootIds.length;
              this.rootIds.splice(position + length_1 + 1, 0, id);
            } else {
              this.rootIds.splice(position, 0, id);
            }
          }
          this.nodes[id] = this.nodes[id] || [];
        };
        MultiRootTree2.prototype.insertIdIntoNode = function(nodeKey, id, position) {
          this.nodes[nodeKey] = this.nodes[nodeKey] || [];
          this.nodes[id] = this.nodes[id] || [];
          if (position === void 0) {
            this.nodeInsertAtEnd(nodeKey, id);
          } else {
            if (position < 0) {
              var length_2 = this.nodes[nodeKey].length;
              this.nodes[nodeKey].splice(position + length_2 + 1, 0, id);
            } else {
              this.nodes[nodeKey].splice(position, 0, id);
            }
          }
        };
        MultiRootTree2.prototype.moveId = function(moveId, beforeId, direction) {
          var sourceId = moveId;
          var sourceRootIndex = this.findRootId(sourceId);
          var sourceNodeKey;
          var sourceNodeIdIndex;
          if (this.nodes[beforeId]) {
            sourceNodeKey = beforeId;
          }
          for (var nodeKey in this.nodes) {
            if (this.nodes.hasOwnProperty(nodeKey)) {
              sourceNodeIdIndex = this.findNodeId(nodeKey, beforeId);
              break;
            }
          }
          var targetId = beforeId;
          var targetRootIndex = this.findRootId(targetId);
          var targetNodeKey;
          var targetNodeIdIndex;
          if (this.nodes[beforeId]) {
            targetNodeKey = beforeId;
          }
          for (var nodeKey in this.nodes) {
            if (this.nodes.hasOwnProperty(nodeKey)) {
              targetNodeIdIndex = this.findNodeId(nodeKey, beforeId);
              break;
            }
          }
          if (sourceRootIndex > -1) {
            if (targetRootIndex > -1) {
              this.rootDelete(sourceRootIndex);
              if (targetRootIndex > sourceRootIndex) {
                targetRootIndex--;
              } else {
              }
              switch (direction) {
                case Direction.BEFORE:
                  this.insertIdIntoRoot(sourceId, targetRootIndex);
                  break;
                case Direction.AFTER:
                  this.insertIdIntoRoot(sourceId, targetRootIndex + 1);
                  break;
                case Direction.INSIDE_AT_START:
                  this.nodeInsertAtStart(targetId, sourceId);
                  break;
                case Direction.INSIDE_AT_END:
                  this.nodeInsertAtEnd(targetId, sourceId);
                  break;
              }
            } else {
              this.rootDelete(sourceRootIndex);
              for (var nodeKey in this.nodes) {
                if (this.nodes.hasOwnProperty(nodeKey)) {
                  var index = this.findNodeId(nodeKey, targetId);
                  if (index > -1) {
                    switch (direction) {
                      case Direction.BEFORE:
                        this.insertIdIntoNode(nodeKey, sourceId, index);
                        break;
                      case Direction.AFTER:
                        this.insertIdIntoNode(nodeKey, sourceId, index + 1);
                        break;
                      case Direction.INSIDE_AT_START:
                        this.nodeInsertAtStart(targetId, sourceId);
                        break;
                      case Direction.INSIDE_AT_END:
                        this.nodeInsertAtEnd(targetId, sourceId);
                        break;
                    }
                    break;
                  }
                }
              }
            }
          } else {
            if (targetRootIndex > -1) {
              for (var nodeKey in this.nodes) {
                if (this.nodes.hasOwnProperty(nodeKey)) {
                  var index = this.findNodeId(nodeKey, sourceId);
                  if (index > -1) {
                    this.nodeDeleteAtIndex(nodeKey, index);
                    break;
                  }
                }
              }
              switch (direction) {
                case Direction.BEFORE:
                  this.insertIdIntoRoot(sourceId, targetRootIndex);
                  break;
                case Direction.AFTER:
                  this.insertIdIntoRoot(sourceId, targetRootIndex + 1);
                  break;
                case Direction.INSIDE_AT_START:
                  this.nodeInsertAtStart(targetId, sourceId);
                  break;
                case Direction.INSIDE_AT_END:
                  this.nodeInsertAtEnd(targetId, sourceId);
                  break;
              }
            } else {
              for (var nodeKey in this.nodes) {
                if (this.nodes.hasOwnProperty(nodeKey)) {
                  var index = this.findNodeId(nodeKey, sourceId);
                  if (index > -1) {
                    this.nodeDeleteAtIndex(nodeKey, index);
                    break;
                  }
                }
              }
              for (var nodeKey in this.nodes) {
                if (this.nodes.hasOwnProperty(nodeKey)) {
                  var index = this.findNodeId(nodeKey, targetId);
                  if (index > -1) {
                    switch (direction) {
                      case Direction.BEFORE:
                        this.insertIdIntoNode(nodeKey, sourceId, index);
                        break;
                      case Direction.AFTER:
                        this.insertIdIntoNode(nodeKey, sourceId, index + 1);
                        break;
                      case Direction.INSIDE_AT_START:
                        this.nodeInsertAtStart(targetId, sourceId);
                        break;
                      case Direction.INSIDE_AT_END:
                        this.nodeInsertAtEnd(targetId, sourceId);
                        break;
                    }
                    break;
                  }
                }
              }
            }
          }
        };
        MultiRootTree2.prototype.swapArrayElements = function(arr, indexA, indexB) {
          var temp = arr[indexA];
          arr[indexA] = arr[indexB];
          arr[indexB] = temp;
          return arr;
        };
        MultiRootTree2.prototype.rootDeleteId = function(id) {
          var index = this.findRootId(id);
          if (index > -1) {
            this.rootDelete(index);
          }
        };
        MultiRootTree2.prototype.nodeAndSubNodesDelete = function(nodeKey) {
          var toDeleteLater = [];
          for (var i3 = 0; i3 < this.nodes[nodeKey].length; i3++) {
            var id = this.nodes[nodeKey][i3];
            this.nodeAndSubNodesDelete(id);
            toDeleteLater.push(nodeKey);
          }
          this.nodeDelete(nodeKey);
          for (var i3 = 0; i3 < toDeleteLater.length; i3++) {
            this.nodeDelete(toDeleteLater[i3]);
          }
        };
        MultiRootTree2.prototype.nodeRefrencesDelete = function(id) {
          for (var nodeKey in this.nodes) {
            if (this.nodes.hasOwnProperty(nodeKey)) {
              for (var i3 = 0; i3 < this.nodes[nodeKey].length; i3++) {
                var targetId = this.nodes[nodeKey][i3];
                if (targetId === id) {
                  this.nodeDeleteAtIndex(nodeKey, i3);
                }
              }
            }
          }
        };
        MultiRootTree2.prototype.nodeDelete = function(nodeKey) {
          delete this.nodes[nodeKey];
        };
        MultiRootTree2.prototype.findRootId = function(id) {
          return this.rootIds.indexOf(id);
        };
        MultiRootTree2.prototype.findNodeId = function(nodeKey, id) {
          return this.nodes[nodeKey].indexOf(id);
        };
        MultiRootTree2.prototype.findNode = function(nodeKey) {
          return this.nodes[nodeKey];
        };
        MultiRootTree2.prototype.nodeInsertAtStart = function(nodeKey, id) {
          this.nodes[nodeKey].unshift(id);
        };
        MultiRootTree2.prototype.nodeInsertAtEnd = function(nodeKey, id) {
          this.nodes[nodeKey].push(id);
        };
        MultiRootTree2.prototype.rootDelete = function(index) {
          this.rootIds.splice(index, 1);
        };
        MultiRootTree2.prototype.nodeDeleteAtIndex = function(nodeKey, index) {
          this.nodes[nodeKey].splice(index, 1);
        };
        MultiRootTree2.prototype.rootInsertAtStart = function(id) {
          this.rootIds.unshift(id);
        };
        MultiRootTree2.prototype.rootInsertAtEnd = function(id) {
          this.rootIds.push(id);
        };
        return MultiRootTree2;
      })()
    );
    exports.default = MultiRootTree;
  }
});

// node_modules/typescript-collections/dist/lib/index.js
var require_lib = __commonJS({
  "node_modules/typescript-collections/dist/lib/index.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    var _arrays = require_arrays();
    exports.arrays = _arrays;
    var Bag_1 = require_Bag();
    exports.Bag = Bag_1.default;
    var BSTree_1 = require_BSTree();
    exports.BSTree = BSTree_1.default;
    var BSTreeKV_1 = require_BSTreeKV();
    exports.BSTreeKV = BSTreeKV_1.default;
    var Dictionary_1 = require_Dictionary();
    exports.Dictionary = Dictionary_1.default;
    var Heap_1 = require_Heap();
    exports.Heap = Heap_1.default;
    var LinkedDictionary_1 = require_LinkedDictionary();
    exports.LinkedDictionary = LinkedDictionary_1.default;
    var LinkedList_1 = require_LinkedList();
    exports.LinkedList = LinkedList_1.default;
    var MultiDictionary_1 = require_MultiDictionary();
    exports.MultiDictionary = MultiDictionary_1.default;
    var FactoryDictionary_1 = require_FactoryDictionary();
    exports.FactoryDictionary = FactoryDictionary_1.default;
    var FactoryDictionary_2 = require_FactoryDictionary();
    exports.DefaultDictionary = FactoryDictionary_2.default;
    var Queue_1 = require_Queue();
    exports.Queue = Queue_1.default;
    var PriorityQueue_1 = require_PriorityQueue();
    exports.PriorityQueue = PriorityQueue_1.default;
    var Set_1 = require_Set();
    exports.Set = Set_1.default;
    var Stack_1 = require_Stack();
    exports.Stack = Stack_1.default;
    var MultiRootTree_1 = require_MultiRootTree();
    exports.MultiRootTree = MultiRootTree_1.default;
    var _util = require_util();
    exports.util = _util;
  }
});

// node_modules/preact/dist/preact.module.js
var n;
var l;
var u;
var t;
var i;
var r;
var o;
var e;
var f;
var c;
var s;
var a;
var h;
var p;
var v;
var y;
var d = {};
var w = [];
var _ = /acit|ex(?:s|g|n|p|$)|rph|grid|ows|mnc|ntw|ine[ch]|zoo|^ord|itera/i;
var g = Array.isArray;
function m(n2, l3) {
  for (var u4 in l3) n2[u4] = l3[u4];
  return n2;
}
function b(n2) {
  n2 && n2.parentNode && n2.parentNode.removeChild(n2);
}
function k(l3, u4, t3) {
  var i3, r3, o3, e3 = {};
  for (o3 in u4) "key" == o3 ? i3 = u4[o3] : "ref" == o3 ? r3 = u4[o3] : e3[o3] = u4[o3];
  if (arguments.length > 2 && (e3.children = arguments.length > 3 ? n.call(arguments, 2) : t3), "function" == typeof l3 && null != l3.defaultProps) for (o3 in l3.defaultProps) void 0 === e3[o3] && (e3[o3] = l3.defaultProps[o3]);
  return x(l3, e3, i3, r3, null);
}
function x(n2, t3, i3, r3, o3) {
  var e3 = { type: n2, props: t3, key: i3, ref: r3, __k: null, __: null, __b: 0, __e: null, __c: null, constructor: void 0, __v: null == o3 ? ++u : o3, __i: -1, __u: 0 };
  return null == o3 && null != l.vnode && l.vnode(e3), e3;
}
function S(n2) {
  return n2.children;
}
function C(n2, l3) {
  this.props = n2, this.context = l3;
}
function $(n2, l3) {
  if (null == l3) return n2.__ ? $(n2.__, n2.__i + 1) : null;
  for (var u4; l3 < n2.__k.length; l3++) if (null != (u4 = n2.__k[l3]) && null != u4.__e) return u4.__e;
  return "function" == typeof n2.type ? $(n2) : null;
}
function I(n2) {
  if (n2.__P && n2.__d) {
    var u4 = n2.__v, t3 = u4.__e, i3 = [], r3 = [], o3 = m({}, u4);
    o3.__v = u4.__v + 1, l.vnode && l.vnode(o3), q(n2.__P, o3, u4, n2.__n, n2.__P.namespaceURI, 32 & u4.__u ? [t3] : null, i3, null == t3 ? $(u4) : t3, !!(32 & u4.__u), r3), o3.__v = u4.__v, o3.__.__k[o3.__i] = o3, D(i3, o3, r3), u4.__e = u4.__ = null, o3.__e != t3 && P(o3);
  }
}
function P(n2) {
  if (null != (n2 = n2.__) && null != n2.__c) return n2.__e = n2.__c.base = null, n2.__k.some(function(l3) {
    if (null != l3 && null != l3.__e) return n2.__e = n2.__c.base = l3.__e;
  }), P(n2);
}
function A(n2) {
  (!n2.__d && (n2.__d = true) && i.push(n2) && !H.__r++ || r != l.debounceRendering) && ((r = l.debounceRendering) || o)(H);
}
function H() {
  try {
    for (var n2, l3 = 1; i.length; ) i.length > l3 && i.sort(e), n2 = i.shift(), l3 = i.length, I(n2);
  } finally {
    i.length = H.__r = 0;
  }
}
function L(n2, l3, u4, t3, i3, r3, o3, e3, f4, c3, s3) {
  var a3, h3, p3, v3, y3, _3, g4, m3 = t3 && t3.__k || w, b2 = l3.length;
  for (f4 = T(u4, l3, m3, f4, b2), a3 = 0; a3 < b2; a3++) null != (p3 = u4.__k[a3]) && (h3 = -1 != p3.__i && m3[p3.__i] || d, p3.__i = a3, _3 = q(n2, p3, h3, i3, r3, o3, e3, f4, c3, s3), v3 = p3.__e, p3.ref && h3.ref != p3.ref && (h3.ref && J(h3.ref, null, p3), s3.push(p3.ref, p3.__c || v3, p3)), null == y3 && null != v3 && (y3 = v3), (g4 = !!(4 & p3.__u)) || h3.__k === p3.__k ? (f4 = j(p3, f4, n2, g4), g4 && h3.__e && (h3.__e = null)) : "function" == typeof p3.type && void 0 !== _3 ? f4 = _3 : v3 && (f4 = v3.nextSibling), p3.__u &= -7);
  return u4.__e = y3, f4;
}
function T(n2, l3, u4, t3, i3) {
  var r3, o3, e3, f4, c3, s3 = u4.length, a3 = s3, h3 = 0;
  for (n2.__k = new Array(i3), r3 = 0; r3 < i3; r3++) null != (o3 = l3[r3]) && "boolean" != typeof o3 && "function" != typeof o3 ? ("string" == typeof o3 || "number" == typeof o3 || "bigint" == typeof o3 || o3.constructor == String ? o3 = n2.__k[r3] = x(null, o3, null, null, null) : g(o3) ? o3 = n2.__k[r3] = x(S, { children: o3 }, null, null, null) : void 0 === o3.constructor && o3.__b > 0 ? o3 = n2.__k[r3] = x(o3.type, o3.props, o3.key, o3.ref ? o3.ref : null, o3.__v) : n2.__k[r3] = o3, f4 = r3 + h3, o3.__ = n2, o3.__b = n2.__b + 1, e3 = null, -1 != (c3 = o3.__i = O(o3, u4, f4, a3)) && (a3--, (e3 = u4[c3]) && (e3.__u |= 2)), null == e3 || null == e3.__v ? (-1 == c3 && (i3 > s3 ? h3-- : i3 < s3 && h3++), "function" != typeof o3.type && (o3.__u |= 4)) : c3 != f4 && (c3 == f4 - 1 ? h3-- : c3 == f4 + 1 ? h3++ : (c3 > f4 ? h3-- : h3++, o3.__u |= 4))) : n2.__k[r3] = null;
  if (a3) for (r3 = 0; r3 < s3; r3++) null != (e3 = u4[r3]) && 0 == (2 & e3.__u) && (e3.__e == t3 && (t3 = $(e3)), K(e3, e3));
  return t3;
}
function j(n2, l3, u4, t3) {
  var i3, r3;
  if ("function" == typeof n2.type) {
    for (i3 = n2.__k, r3 = 0; i3 && r3 < i3.length; r3++) i3[r3] && (i3[r3].__ = n2, l3 = j(i3[r3], l3, u4, t3));
    return l3;
  }
  n2.__e != l3 && (t3 && (l3 && n2.type && !l3.parentNode && (l3 = $(n2)), u4.insertBefore(n2.__e, l3 || null)), l3 = n2.__e);
  do {
    l3 = l3 && l3.nextSibling;
  } while (null != l3 && 8 == l3.nodeType);
  return l3;
}
function F(n2, l3) {
  return l3 = l3 || [], null == n2 || "boolean" == typeof n2 || (g(n2) ? n2.some(function(n3) {
    F(n3, l3);
  }) : l3.push(n2)), l3;
}
function O(n2, l3, u4, t3) {
  var i3, r3, o3, e3 = n2.key, f4 = n2.type, c3 = l3[u4], s3 = null != c3 && 0 == (2 & c3.__u);
  if (null === c3 && null == e3 || s3 && e3 == c3.key && f4 == c3.type) return u4;
  if (t3 > (s3 ? 1 : 0)) {
    for (i3 = u4 - 1, r3 = u4 + 1; i3 >= 0 || r3 < l3.length; ) if (null != (c3 = l3[o3 = i3 >= 0 ? i3-- : r3++]) && 0 == (2 & c3.__u) && e3 == c3.key && f4 == c3.type) return o3;
  }
  return -1;
}
function z(n2, l3, u4) {
  "-" == l3[0] ? n2.setProperty(l3, null == u4 ? "" : u4) : n2[l3] = null == u4 ? "" : "number" != typeof u4 || _.test(l3) ? u4 : u4 + "px";
}
function N(n2, l3, u4, t3, i3) {
  var r3, o3;
  n: if ("style" == l3) if ("string" == typeof u4) n2.style.cssText = u4;
  else {
    if ("string" == typeof t3 && (n2.style.cssText = t3 = ""), t3) for (l3 in t3) u4 && l3 in u4 || z(n2.style, l3, "");
    if (u4) for (l3 in u4) t3 && u4[l3] == t3[l3] || z(n2.style, l3, u4[l3]);
  }
  else if ("o" == l3[0] && "n" == l3[1]) r3 = l3 != (l3 = l3.replace(a, "$1")), o3 = l3.toLowerCase(), l3 = o3 in n2 || "onFocusOut" == l3 || "onFocusIn" == l3 ? o3.slice(2) : l3.slice(2), n2.l || (n2.l = {}), n2.l[l3 + r3] = u4, u4 ? t3 ? u4[s] = t3[s] : (u4[s] = h, n2.addEventListener(l3, r3 ? v : p, r3)) : n2.removeEventListener(l3, r3 ? v : p, r3);
  else {
    if ("http://www.w3.org/2000/svg" == i3) l3 = l3.replace(/xlink(H|:h)/, "h").replace(/sName$/, "s");
    else if ("width" != l3 && "height" != l3 && "href" != l3 && "list" != l3 && "form" != l3 && "tabIndex" != l3 && "download" != l3 && "rowSpan" != l3 && "colSpan" != l3 && "role" != l3 && "popover" != l3 && l3 in n2) try {
      n2[l3] = null == u4 ? "" : u4;
      break n;
    } catch (n3) {
    }
    "function" == typeof u4 || (null == u4 || false === u4 && "-" != l3[4] ? n2.removeAttribute(l3) : n2.setAttribute(l3, "popover" == l3 && 1 == u4 ? "" : u4));
  }
}
function V(n2) {
  return function(u4) {
    if (this.l) {
      var t3 = this.l[u4.type + n2];
      if (null == u4[c]) u4[c] = h++;
      else if (u4[c] < t3[s]) return;
      return t3(l.event ? l.event(u4) : u4);
    }
  };
}
function q(n2, u4, t3, i3, r3, o3, e3, f4, c3, s3) {
  var a3, h3, p3, v3, y3, d3, _3, k3, x3, M3, $2, I2, P4, A4, H3, T4 = u4.type;
  if (void 0 !== u4.constructor) return null;
  128 & t3.__u && (c3 = !!(32 & t3.__u), o3 = [f4 = u4.__e = t3.__e]), (a3 = l.__b) && a3(u4);
  n: if ("function" == typeof T4) try {
    if (k3 = u4.props, x3 = T4.prototype && T4.prototype.render, M3 = (a3 = T4.contextType) && i3[a3.__c], $2 = a3 ? M3 ? M3.props.value : a3.__ : i3, t3.__c ? _3 = (h3 = u4.__c = t3.__c).__ = h3.__E : (x3 ? u4.__c = h3 = new T4(k3, $2) : (u4.__c = h3 = new C(k3, $2), h3.constructor = T4, h3.render = Q), M3 && M3.sub(h3), h3.state || (h3.state = {}), h3.__n = i3, p3 = h3.__d = true, h3.__h = [], h3._sb = []), x3 && null == h3.__s && (h3.__s = h3.state), x3 && null != T4.getDerivedStateFromProps && (h3.__s == h3.state && (h3.__s = m({}, h3.__s)), m(h3.__s, T4.getDerivedStateFromProps(k3, h3.__s))), v3 = h3.props, y3 = h3.state, h3.__v = u4, p3) x3 && null == T4.getDerivedStateFromProps && null != h3.componentWillMount && h3.componentWillMount(), x3 && null != h3.componentDidMount && h3.__h.push(h3.componentDidMount);
    else {
      if (x3 && null == T4.getDerivedStateFromProps && k3 !== v3 && null != h3.componentWillReceiveProps && h3.componentWillReceiveProps(k3, $2), u4.__v == t3.__v || !h3.__e && null != h3.shouldComponentUpdate && false === h3.shouldComponentUpdate(k3, h3.__s, $2)) {
        u4.__v != t3.__v && (h3.props = k3, h3.state = h3.__s, h3.__d = false), u4.__e = t3.__e, u4.__k = t3.__k, u4.__k.some(function(n3) {
          n3 && (n3.__ = u4);
        }), w.push.apply(h3.__h, h3._sb), h3._sb = [], h3.__h.length && e3.push(h3);
        break n;
      }
      null != h3.componentWillUpdate && h3.componentWillUpdate(k3, h3.__s, $2), x3 && null != h3.componentDidUpdate && h3.__h.push(function() {
        h3.componentDidUpdate(v3, y3, d3);
      });
    }
    if (h3.context = $2, h3.props = k3, h3.__P = n2, h3.__e = false, I2 = l.__r, P4 = 0, x3) h3.state = h3.__s, h3.__d = false, I2 && I2(u4), a3 = h3.render(h3.props, h3.state, h3.context), w.push.apply(h3.__h, h3._sb), h3._sb = [];
    else do {
      h3.__d = false, I2 && I2(u4), a3 = h3.render(h3.props, h3.state, h3.context), h3.state = h3.__s;
    } while (h3.__d && ++P4 < 25);
    h3.state = h3.__s, null != h3.getChildContext && (i3 = m(m({}, i3), h3.getChildContext())), x3 && !p3 && null != h3.getSnapshotBeforeUpdate && (d3 = h3.getSnapshotBeforeUpdate(v3, y3)), A4 = null != a3 && a3.type === S && null == a3.key ? E(a3.props.children) : a3, f4 = L(n2, g(A4) ? A4 : [A4], u4, t3, i3, r3, o3, e3, f4, c3, s3), h3.base = u4.__e, u4.__u &= -161, h3.__h.length && e3.push(h3), _3 && (h3.__E = h3.__ = null);
  } catch (n3) {
    if (u4.__v = null, c3 || null != o3) if (n3.then) {
      for (u4.__u |= c3 ? 160 : 128; f4 && 8 == f4.nodeType && f4.nextSibling; ) f4 = f4.nextSibling;
      o3[o3.indexOf(f4)] = null, u4.__e = f4;
    } else {
      for (H3 = o3.length; H3--; ) b(o3[H3]);
      B(u4);
    }
    else u4.__e = t3.__e, u4.__k = t3.__k, n3.then || B(u4);
    l.__e(n3, u4, t3);
  }
  else null == o3 && u4.__v == t3.__v ? (u4.__k = t3.__k, u4.__e = t3.__e) : f4 = u4.__e = G(t3.__e, u4, t3, i3, r3, o3, e3, c3, s3);
  return (a3 = l.diffed) && a3(u4), 128 & u4.__u ? void 0 : f4;
}
function B(n2) {
  n2 && (n2.__c && (n2.__c.__e = true), n2.__k && n2.__k.some(B));
}
function D(n2, u4, t3) {
  for (var i3 = 0; i3 < t3.length; i3++) J(t3[i3], t3[++i3], t3[++i3]);
  l.__c && l.__c(u4, n2), n2.some(function(u5) {
    try {
      n2 = u5.__h, u5.__h = [], n2.some(function(n3) {
        n3.call(u5);
      });
    } catch (n3) {
      l.__e(n3, u5.__v);
    }
  });
}
function E(n2) {
  return "object" != typeof n2 || null == n2 || n2.__b > 0 ? n2 : g(n2) ? n2.map(E) : m({}, n2);
}
function G(u4, t3, i3, r3, o3, e3, f4, c3, s3) {
  var a3, h3, p3, v3, y3, w3, _3, m3 = i3.props || d, k3 = t3.props, x3 = t3.type;
  if ("svg" == x3 ? o3 = "http://www.w3.org/2000/svg" : "math" == x3 ? o3 = "http://www.w3.org/1998/Math/MathML" : o3 || (o3 = "http://www.w3.org/1999/xhtml"), null != e3) {
    for (a3 = 0; a3 < e3.length; a3++) if ((y3 = e3[a3]) && "setAttribute" in y3 == !!x3 && (x3 ? y3.localName == x3 : 3 == y3.nodeType)) {
      u4 = y3, e3[a3] = null;
      break;
    }
  }
  if (null == u4) {
    if (null == x3) return document.createTextNode(k3);
    u4 = document.createElementNS(o3, x3, k3.is && k3), c3 && (l.__m && l.__m(t3, e3), c3 = false), e3 = null;
  }
  if (null == x3) m3 === k3 || c3 && u4.data == k3 || (u4.data = k3);
  else {
    if (e3 = e3 && n.call(u4.childNodes), !c3 && null != e3) for (m3 = {}, a3 = 0; a3 < u4.attributes.length; a3++) m3[(y3 = u4.attributes[a3]).name] = y3.value;
    for (a3 in m3) y3 = m3[a3], "dangerouslySetInnerHTML" == a3 ? p3 = y3 : "children" == a3 || a3 in k3 || "value" == a3 && "defaultValue" in k3 || "checked" == a3 && "defaultChecked" in k3 || N(u4, a3, null, y3, o3);
    for (a3 in k3) y3 = k3[a3], "children" == a3 ? v3 = y3 : "dangerouslySetInnerHTML" == a3 ? h3 = y3 : "value" == a3 ? w3 = y3 : "checked" == a3 ? _3 = y3 : c3 && "function" != typeof y3 || m3[a3] === y3 || N(u4, a3, y3, m3[a3], o3);
    if (h3) c3 || p3 && (h3.__html == p3.__html || h3.__html == u4.innerHTML) || (u4.innerHTML = h3.__html), t3.__k = [];
    else if (p3 && (u4.innerHTML = ""), L("template" == t3.type ? u4.content : u4, g(v3) ? v3 : [v3], t3, i3, r3, "foreignObject" == x3 ? "http://www.w3.org/1999/xhtml" : o3, e3, f4, e3 ? e3[0] : i3.__k && $(i3, 0), c3, s3), null != e3) for (a3 = e3.length; a3--; ) b(e3[a3]);
    c3 || (a3 = "value", "progress" == x3 && null == w3 ? u4.removeAttribute("value") : null != w3 && (w3 !== u4[a3] || "progress" == x3 && !w3 || "option" == x3 && w3 != m3[a3]) && N(u4, a3, w3, m3[a3], o3), a3 = "checked", null != _3 && _3 != u4[a3] && N(u4, a3, _3, m3[a3], o3));
  }
  return u4;
}
function J(n2, u4, t3) {
  try {
    if ("function" == typeof n2) {
      var i3 = "function" == typeof n2.__u;
      i3 && n2.__u(), i3 && null == u4 || (n2.__u = n2(u4));
    } else n2.current = u4;
  } catch (n3) {
    l.__e(n3, t3);
  }
}
function K(n2, u4, t3) {
  var i3, r3;
  if (l.unmount && l.unmount(n2), (i3 = n2.ref) && (i3.current && i3.current != n2.__e || J(i3, null, u4)), null != (i3 = n2.__c)) {
    if (i3.componentWillUnmount) try {
      i3.componentWillUnmount();
    } catch (n3) {
      l.__e(n3, u4);
    }
    i3.base = i3.__P = null;
  }
  if (i3 = n2.__k) for (r3 = 0; r3 < i3.length; r3++) i3[r3] && K(i3[r3], u4, t3 || "function" != typeof n2.type);
  t3 || b(n2.__e), n2.__c = n2.__ = n2.__e = void 0;
}
function Q(n2, l3, u4) {
  return this.constructor(n2, u4);
}
function R(u4, t3, i3) {
  var r3, o3, e3, f4;
  t3 == document && (t3 = document.documentElement), l.__ && l.__(u4, t3), o3 = (r3 = "function" == typeof i3) ? null : i3 && i3.__k || t3.__k, e3 = [], f4 = [], q(t3, u4 = (!r3 && i3 || t3).__k = k(S, null, [u4]), o3 || d, d, t3.namespaceURI, !r3 && i3 ? [i3] : o3 ? null : t3.firstChild ? n.call(t3.childNodes) : null, e3, !r3 && i3 ? i3 : o3 ? o3.__e : t3.firstChild, r3, f4), D(e3, u4, f4);
}
n = w.slice, l = { __e: function(n2, l3, u4, t3) {
  for (var i3, r3, o3; l3 = l3.__; ) if ((i3 = l3.__c) && !i3.__) try {
    if ((r3 = i3.constructor) && null != r3.getDerivedStateFromError && (i3.setState(r3.getDerivedStateFromError(n2)), o3 = i3.__d), null != i3.componentDidCatch && (i3.componentDidCatch(n2, t3 || {}), o3 = i3.__d), o3) return i3.__E = i3;
  } catch (l4) {
    n2 = l4;
  }
  throw n2;
} }, u = 0, t = function(n2) {
  return null != n2 && void 0 === n2.constructor;
}, C.prototype.setState = function(n2, l3) {
  var u4;
  u4 = null != this.__s && this.__s != this.state ? this.__s : this.__s = m({}, this.state), "function" == typeof n2 && (n2 = n2(m({}, u4), this.props)), n2 && m(u4, n2), null != n2 && this.__v && (l3 && this._sb.push(l3), A(this));
}, C.prototype.forceUpdate = function(n2) {
  this.__v && (this.__e = true, n2 && this.__h.push(n2), A(this));
}, C.prototype.render = S, i = [], o = "function" == typeof Promise ? Promise.prototype.then.bind(Promise.resolve()) : setTimeout, e = function(n2, l3) {
  return n2.__v.__b - l3.__v.__b;
}, H.__r = 0, f = Math.random().toString(8), c = "__d" + f, s = "__a" + f, a = /(PointerCapture)$|Capture$/i, h = 0, p = V(false), v = V(true), y = 0;

// node_modules/preact/hooks/dist/hooks.module.js
var t2;
var r2;
var u2;
var i2;
var o2 = 0;
var f2 = [];
var c2 = l;
var e2 = c2.__b;
var a2 = c2.__r;
var v2 = c2.diffed;
var l2 = c2.__c;
var m2 = c2.unmount;
var s2 = c2.__;
function p2(n2, t3) {
  c2.__h && c2.__h(r2, n2, o2 || t3), o2 = 0;
  var u4 = r2.__H || (r2.__H = { __: [], __h: [] });
  return n2 >= u4.__.length && u4.__.push({}), u4.__[n2];
}
function d2(n2) {
  return o2 = 1, h2(D2, n2);
}
function h2(n2, u4, i3) {
  var o3 = p2(t2++, 2);
  if (o3.t = n2, !o3.__c && (o3.__ = [i3 ? i3(u4) : D2(void 0, u4), function(n3) {
    var t3 = o3.__N ? o3.__N[0] : o3.__[0], r3 = o3.t(t3, n3);
    t3 !== r3 && (o3.__N = [r3, o3.__[1]], o3.__c.setState({}));
  }], o3.__c = r2, !r2.__f)) {
    var f4 = function(n3, t3, r3) {
      if (!o3.__c.__H) return true;
      var u5 = o3.__c.__H.__.filter(function(n4) {
        return n4.__c;
      });
      if (u5.every(function(n4) {
        return !n4.__N;
      })) return !c3 || c3.call(this, n3, t3, r3);
      var i4 = o3.__c.props !== n3;
      return u5.some(function(n4) {
        if (n4.__N) {
          var t4 = n4.__[0];
          n4.__ = n4.__N, n4.__N = void 0, t4 !== n4.__[0] && (i4 = true);
        }
      }), c3 && c3.call(this, n3, t3, r3) || i4;
    };
    r2.__f = true;
    var c3 = r2.shouldComponentUpdate, e3 = r2.componentWillUpdate;
    r2.componentWillUpdate = function(n3, t3, r3) {
      if (this.__e) {
        var u5 = c3;
        c3 = void 0, f4(n3, t3, r3), c3 = u5;
      }
      e3 && e3.call(this, n3, t3, r3);
    }, r2.shouldComponentUpdate = f4;
  }
  return o3.__N || o3.__;
}
function _2(n2, u4) {
  var i3 = p2(t2++, 4);
  !c2.__s && C2(i3.__H, u4) && (i3.__ = n2, i3.u = u4, r2.__h.push(i3));
}
function A2(n2) {
  return o2 = 5, T2(function() {
    return { current: n2 };
  }, []);
}
function T2(n2, r3) {
  var u4 = p2(t2++, 7);
  return C2(u4.__H, r3) && (u4.__ = n2(), u4.__H = r3, u4.__h = n2), u4.__;
}
function j2() {
  for (var n2; n2 = f2.shift(); ) {
    var t3 = n2.__H;
    if (n2.__P && t3) try {
      t3.__h.some(z2), t3.__h.some(B2), t3.__h = [];
    } catch (r3) {
      t3.__h = [], c2.__e(r3, n2.__v);
    }
  }
}
c2.__b = function(n2) {
  r2 = null, e2 && e2(n2);
}, c2.__ = function(n2, t3) {
  n2 && t3.__k && t3.__k.__m && (n2.__m = t3.__k.__m), s2 && s2(n2, t3);
}, c2.__r = function(n2) {
  a2 && a2(n2), t2 = 0;
  var i3 = (r2 = n2.__c).__H;
  i3 && (u2 === r2 ? (i3.__h = [], r2.__h = [], i3.__.some(function(n3) {
    n3.__N && (n3.__ = n3.__N), n3.u = n3.__N = void 0;
  })) : (i3.__h.some(z2), i3.__h.some(B2), i3.__h = [], t2 = 0)), u2 = r2;
}, c2.diffed = function(n2) {
  v2 && v2(n2);
  var t3 = n2.__c;
  t3 && t3.__H && (t3.__H.__h.length && (1 !== f2.push(t3) && i2 === c2.requestAnimationFrame || ((i2 = c2.requestAnimationFrame) || w2)(j2)), t3.__H.__.some(function(n3) {
    n3.u && (n3.__H = n3.u), n3.u = void 0;
  })), u2 = r2 = null;
}, c2.__c = function(n2, t3) {
  t3.some(function(n3) {
    try {
      n3.__h.some(z2), n3.__h = n3.__h.filter(function(n4) {
        return !n4.__ || B2(n4);
      });
    } catch (r3) {
      t3.some(function(n4) {
        n4.__h && (n4.__h = []);
      }), t3 = [], c2.__e(r3, n3.__v);
    }
  }), l2 && l2(n2, t3);
}, c2.unmount = function(n2) {
  m2 && m2(n2);
  var t3, r3 = n2.__c;
  r3 && r3.__H && (r3.__H.__.some(function(n3) {
    try {
      z2(n3);
    } catch (n4) {
      t3 = n4;
    }
  }), r3.__H = void 0, t3 && c2.__e(t3, r3.__v));
};
var k2 = "function" == typeof requestAnimationFrame;
function w2(n2) {
  var t3, r3 = function() {
    clearTimeout(u4), k2 && cancelAnimationFrame(t3), setTimeout(n2);
  }, u4 = setTimeout(r3, 35);
  k2 && (t3 = requestAnimationFrame(r3));
}
function z2(n2) {
  var t3 = r2, u4 = n2.__c;
  "function" == typeof u4 && (n2.__c = void 0, u4()), r2 = t3;
}
function B2(n2) {
  var t3 = r2;
  n2.__c = n2.__(), r2 = t3;
}
function C2(n2, t3) {
  return !n2 || n2.length !== t3.length || t3.some(function(t4, r3) {
    return t4 !== n2[r3];
  });
}
function D2(n2, t3) {
  return "function" == typeof t3 ? t3(n2) : t3;
}

// node_modules/preact/compat/dist/compat.module.js
function g3(n2, t3) {
  for (var e3 in t3) n2[e3] = t3[e3];
  return n2;
}
function E2(n2, t3) {
  for (var e3 in n2) if ("__source" !== e3 && !(e3 in t3)) return true;
  for (var r3 in t3) if ("__source" !== r3 && n2[r3] !== t3[r3]) return true;
  return false;
}
function M2(n2, t3) {
  this.props = n2, this.context = t3;
}
(M2.prototype = new C()).isPureReactComponent = true, M2.prototype.shouldComponentUpdate = function(n2, t3) {
  return E2(this.props, n2) || E2(this.state, t3);
};
var T3 = l.__b;
l.__b = function(n2) {
  n2.type && n2.type.__f && n2.ref && (n2.props.ref = n2.ref, n2.ref = null), T3 && T3(n2);
};
var A3 = "undefined" != typeof Symbol && Symbol.for && Symbol.for("react.forward_ref") || 3911;
var O2 = l.__e;
l.__e = function(n2, t3, e3, r3) {
  if (n2.then) {
    for (var u4, o3 = t3; o3 = o3.__; ) if ((u4 = o3.__c) && u4.__c) return null == t3.__e && (t3.__e = e3.__e, t3.__k = e3.__k), u4.__c(n2, t3);
  }
  O2(n2, t3, e3, r3);
};
var U2 = l.unmount;
function V2(n2, t3, e3) {
  return n2 && (n2.__c && n2.__c.__H && (n2.__c.__H.__.forEach(function(n3) {
    "function" == typeof n3.__c && n3.__c();
  }), n2.__c.__H = null), null != (n2 = g3({}, n2)).__c && (n2.__c.__P === e3 && (n2.__c.__P = t3), n2.__c.__e = true, n2.__c = null), n2.__k = n2.__k && n2.__k.map(function(n3) {
    return V2(n3, t3, e3);
  })), n2;
}
function W2(n2, t3, e3) {
  return n2 && e3 && (n2.__v = null, n2.__k = n2.__k && n2.__k.map(function(n3) {
    return W2(n3, t3, e3);
  }), n2.__c && n2.__c.__P === t3 && (n2.__e && e3.appendChild(n2.__e), n2.__c.__e = true, n2.__c.__P = e3)), n2;
}
function P3() {
  this.__u = 0, this.o = null, this.__b = null;
}
function j3(n2) {
  var t3 = n2.__ && n2.__.__c;
  return t3 && t3.__a && t3.__a(n2);
}
function B3() {
  this.i = null, this.l = null;
}
l.unmount = function(n2) {
  var t3 = n2.__c;
  t3 && (t3.__z = true), t3 && t3.__R && t3.__R(), t3 && 32 & n2.__u && (n2.type = null), U2 && U2(n2);
}, (P3.prototype = new C()).__c = function(n2, t3) {
  var e3 = t3.__c, r3 = this;
  null == r3.o && (r3.o = []), r3.o.push(e3);
  var u4 = j3(r3.__v), o3 = false, i3 = function() {
    o3 || r3.__z || (o3 = true, e3.__R = null, u4 ? u4(c3) : c3());
  };
  e3.__R = i3;
  var l3 = e3.__P;
  e3.__P = null;
  var c3 = function() {
    if (!--r3.__u) {
      if (r3.state.__a) {
        var n3 = r3.state.__a;
        r3.__v.__k[0] = W2(n3, n3.__c.__P, n3.__c.__O);
      }
      var t4;
      for (r3.setState({ __a: r3.__b = null }); t4 = r3.o.pop(); ) t4.__P = l3, t4.forceUpdate();
    }
  };
  r3.__u++ || 32 & t3.__u || r3.setState({ __a: r3.__b = r3.__v.__k[0] }), n2.then(i3, i3);
}, P3.prototype.componentWillUnmount = function() {
  this.o = [];
}, P3.prototype.render = function(n2, e3) {
  if (this.__b) {
    if (this.__v.__k) {
      var r3 = document.createElement("div"), o3 = this.__v.__k[0].__c;
      this.__v.__k[0] = V2(this.__b, r3, o3.__O = o3.__P);
    }
    this.__b = null;
  }
  var i3 = e3.__a && k(S, null, n2.fallback);
  return i3 && (i3.__u &= -33), [k(S, null, e3.__a ? null : n2.children), i3];
};
var H2 = function(n2, t3, e3) {
  if (++e3[1] === e3[0] && n2.l.delete(t3), n2.props.revealOrder && ("t" !== n2.props.revealOrder[0] || !n2.l.size)) for (e3 = n2.i; e3; ) {
    for (; e3.length > 3; ) e3.pop()();
    if (e3[1] < e3[0]) break;
    n2.i = e3 = e3[2];
  }
};
(B3.prototype = new C()).__a = function(n2) {
  var t3 = this, e3 = j3(t3.__v), r3 = t3.l.get(n2);
  return r3[0]++, function(u4) {
    var o3 = function() {
      t3.props.revealOrder ? (r3.push(u4), H2(t3, n2, r3)) : u4();
    };
    e3 ? e3(o3) : o3();
  };
}, B3.prototype.render = function(n2) {
  this.i = null, this.l = /* @__PURE__ */ new Map();
  var t3 = F(n2.children);
  n2.revealOrder && "b" === n2.revealOrder[0] && t3.reverse();
  for (var e3 = t3.length; e3--; ) this.l.set(t3[e3], this.i = [1, 0, this.i]);
  return n2.children;
}, B3.prototype.componentDidUpdate = B3.prototype.componentDidMount = function() {
  var n2 = this;
  this.l.forEach(function(t3, e3) {
    H2(n2, e3, t3);
  });
};
var q3 = "undefined" != typeof Symbol && Symbol.for && Symbol.for("react.element") || 60103;
var G2 = /^(?:accent|alignment|arabic|baseline|cap|clip(?!PathU)|color|dominant|fill|flood|font|glyph(?!R)|horiz|image(!S)|letter|lighting|marker(?!H|W|U)|overline|paint|pointer|shape|stop|strikethrough|stroke|text(?!L)|transform|underline|unicode|units|v|vector|vert|word|writing|x(?!C))[A-Z]/;
var J2 = /^on(Ani|Tra|Tou|BeforeInp|Compo)/;
var K2 = /[A-Z0-9]/g;
var Q2 = "undefined" != typeof document;
var X2 = function(n2) {
  return ("undefined" != typeof Symbol && "symbol" == typeof Symbol() ? /fil|che|rad/ : /fil|che|ra/).test(n2);
};
C.prototype.isReactComponent = true, ["componentWillMount", "componentWillReceiveProps", "componentWillUpdate"].forEach(function(t3) {
  Object.defineProperty(C.prototype, t3, { configurable: true, get: function() {
    return this["UNSAFE_" + t3];
  }, set: function(n2) {
    Object.defineProperty(this, t3, { configurable: true, writable: true, value: n2 });
  } });
});
var en = l.event;
l.event = function(n2) {
  return en && (n2 = en(n2)), n2.persist = function() {
  }, n2.isPropagationStopped = function() {
    return this.cancelBubble;
  }, n2.isDefaultPrevented = function() {
    return this.defaultPrevented;
  }, n2.nativeEvent = n2;
};
var rn;
var un = { configurable: true, get: function() {
  return this.class;
} };
var on = l.vnode;
l.vnode = function(n2) {
  "string" == typeof n2.type && (function(n3) {
    var t3 = n3.props, e3 = n3.type, u4 = {}, o3 = -1 == e3.indexOf("-");
    for (var i3 in t3) {
      var l3 = t3[i3];
      if (!("value" === i3 && "defaultValue" in t3 && null == l3 || Q2 && "children" === i3 && "noscript" === e3 || "class" === i3 || "className" === i3)) {
        var c3 = i3.toLowerCase();
        "defaultValue" === i3 && "value" in t3 && null == t3.value ? i3 = "value" : "download" === i3 && true === l3 ? l3 = "" : "translate" === c3 && "no" === l3 ? l3 = false : "o" === c3[0] && "n" === c3[1] ? "ondoubleclick" === c3 ? i3 = "ondblclick" : "onchange" !== c3 || "input" !== e3 && "textarea" !== e3 || X2(t3.type) ? "onfocus" === c3 ? i3 = "onfocusin" : "onblur" === c3 ? i3 = "onfocusout" : J2.test(i3) && (i3 = c3) : c3 = i3 = "oninput" : o3 && G2.test(i3) ? i3 = i3.replace(K2, "-$&").toLowerCase() : null === l3 && (l3 = void 0), "oninput" === c3 && u4[i3 = c3] && (i3 = "oninputCapture"), u4[i3] = l3;
      }
    }
    "select" == e3 && (u4.multiple && Array.isArray(u4.value) && (u4.value = F(t3.children).forEach(function(n4) {
      n4.props.selected = -1 != u4.value.indexOf(n4.props.value);
    })), null != u4.defaultValue && (u4.value = F(t3.children).forEach(function(n4) {
      n4.props.selected = u4.multiple ? -1 != u4.defaultValue.indexOf(n4.props.value) : u4.defaultValue == n4.props.value;
    }))), t3.class && !t3.className ? (u4.class = t3.class, Object.defineProperty(u4, "className", un)) : t3.className && (u4.class = u4.className = t3.className), n3.props = u4;
  })(n2), n2.$$typeof = q3, on && on(n2);
};
var ln = l.__r;
l.__r = function(n2) {
  ln && ln(n2), rn = n2.__c;
};
var cn = l.diffed;
l.diffed = function(n2) {
  cn && cn(n2);
  var t3 = n2.props, e3 = n2.__e;
  null != e3 && "textarea" === n2.type && "value" in t3 && t3.value !== e3.value && (e3.value = null == t3.value ? "" : t3.value), rn = null;
};

// src/lib/DataLoader2.tsx
var forceRenderCounter = 1;
function useLoaders(loaderFunc, stores, deps) {
  function trackAndLoad() {
    const seq_values = stores.map(() => 0);
    const global_seq_values = stores.map((s3) => s3.getSequence());
    const subscriptions = stores.map((p3, idx) => p3.addListener("loadSequence", (seq_value) => seq_values[idx] = Math.max(seq_values[idx] || 0, seq_value)));
    let ret;
    try {
      ret = loaderFunc();
    } finally {
      subscriptions.forEach((s3) => s3.remove());
    }
    return { data: ret, data_sequences: seq_values, global_sequences: global_seq_values };
  }
  const memoizedPropsData = T2(trackAndLoad, deps);
  const changedDataLoad = A2(void 0);
  const [, setForceRenderCount] = d2(0);
  _2(() => {
    const storeChangeHandler = () => {
      const newLoad = trackAndLoad();
      const lastLoad = changedDataLoad.current && changedDataLoad.current.global_sequences.some(
        (seq, idx) => memoizedPropsData.global_sequences[idx] < seq
      ) ? changedDataLoad.current : memoizedPropsData;
      if (newLoad.data_sequences.some((seq, idx) => seq > lastLoad.data_sequences[idx])) {
        changedDataLoad.current = newLoad;
        setForceRenderCount(forceRenderCounter++);
      } else {
      }
    };
    const subscriptions = stores.map((s3) => s3.addListener("change", storeChangeHandler));
    return () => {
      subscriptions.map((s3) => s3.remove());
    };
  }, deps);
  if (changedDataLoad.current && changedDataLoad.current.global_sequences.some((seq, idx) => memoizedPropsData.global_sequences[idx] < seq)) {
    return changedDataLoad.current.data;
  } else {
    return memoizedPropsData.data;
  }
}

// node_modules/axios/lib/helpers/bind.js
function bind(fn, thisArg) {
  return function wrap() {
    return fn.apply(thisArg, arguments);
  };
}

// node_modules/axios/lib/utils.js
var { toString } = Object.prototype;
var { getPrototypeOf } = Object;
var { iterator, toStringTag } = Symbol;
var kindOf = /* @__PURE__ */ ((cache) => (thing) => {
  const str = toString.call(thing);
  return cache[str] || (cache[str] = str.slice(8, -1).toLowerCase());
})(/* @__PURE__ */ Object.create(null));
var kindOfTest = (type) => {
  type = type.toLowerCase();
  return (thing) => kindOf(thing) === type;
};
var typeOfTest = (type) => (thing) => typeof thing === type;
var { isArray } = Array;
var isUndefined = typeOfTest("undefined");
function isBuffer(val) {
  return val !== null && !isUndefined(val) && val.constructor !== null && !isUndefined(val.constructor) && isFunction(val.constructor.isBuffer) && val.constructor.isBuffer(val);
}
var isArrayBuffer = kindOfTest("ArrayBuffer");
function isArrayBufferView(val) {
  let result;
  if (typeof ArrayBuffer !== "undefined" && ArrayBuffer.isView) {
    result = ArrayBuffer.isView(val);
  } else {
    result = val && val.buffer && isArrayBuffer(val.buffer);
  }
  return result;
}
var isString = typeOfTest("string");
var isFunction = typeOfTest("function");
var isNumber = typeOfTest("number");
var isObject = (thing) => thing !== null && typeof thing === "object";
var isBoolean = (thing) => thing === true || thing === false;
var isPlainObject = (val) => {
  if (kindOf(val) !== "object") {
    return false;
  }
  const prototype2 = getPrototypeOf(val);
  return (prototype2 === null || prototype2 === Object.prototype || Object.getPrototypeOf(prototype2) === null) && !(toStringTag in val) && !(iterator in val);
};
var isEmptyObject = (val) => {
  if (!isObject(val) || isBuffer(val)) {
    return false;
  }
  try {
    return Object.keys(val).length === 0 && Object.getPrototypeOf(val) === Object.prototype;
  } catch (e3) {
    return false;
  }
};
var isDate = kindOfTest("Date");
var isFile = kindOfTest("File");
var isReactNativeBlob = (value) => {
  return !!(value && typeof value.uri !== "undefined");
};
var isReactNative = (formData) => formData && typeof formData.getParts !== "undefined";
var isBlob = kindOfTest("Blob");
var isFileList = kindOfTest("FileList");
var isStream = (val) => isObject(val) && isFunction(val.pipe);
function getGlobal() {
  if (typeof globalThis !== "undefined") return globalThis;
  if (typeof self !== "undefined") return self;
  if (typeof window !== "undefined") return window;
  if (typeof global !== "undefined") return global;
  return {};
}
var G3 = getGlobal();
var FormDataCtor = typeof G3.FormData !== "undefined" ? G3.FormData : void 0;
var isFormData = (thing) => {
  if (!thing) return false;
  if (FormDataCtor && thing instanceof FormDataCtor) return true;
  const proto = getPrototypeOf(thing);
  if (!proto || proto === Object.prototype) return false;
  if (!isFunction(thing.append)) return false;
  const kind = kindOf(thing);
  return kind === "formdata" || // detect form-data instance
  kind === "object" && isFunction(thing.toString) && thing.toString() === "[object FormData]";
};
var isURLSearchParams = kindOfTest("URLSearchParams");
var [isReadableStream, isRequest, isResponse, isHeaders] = [
  "ReadableStream",
  "Request",
  "Response",
  "Headers"
].map(kindOfTest);
var trim = (str) => {
  return str.trim ? str.trim() : str.replace(/^[\s\uFEFF\xA0]+|[\s\uFEFF\xA0]+$/g, "");
};
function forEach(obj, fn, { allOwnKeys = false } = {}) {
  if (obj === null || typeof obj === "undefined") {
    return;
  }
  let i3;
  let l3;
  if (typeof obj !== "object") {
    obj = [obj];
  }
  if (isArray(obj)) {
    for (i3 = 0, l3 = obj.length; i3 < l3; i3++) {
      fn.call(null, obj[i3], i3, obj);
    }
  } else {
    if (isBuffer(obj)) {
      return;
    }
    const keys = allOwnKeys ? Object.getOwnPropertyNames(obj) : Object.keys(obj);
    const len = keys.length;
    let key;
    for (i3 = 0; i3 < len; i3++) {
      key = keys[i3];
      fn.call(null, obj[key], key, obj);
    }
  }
}
function findKey(obj, key) {
  if (isBuffer(obj)) {
    return null;
  }
  key = key.toLowerCase();
  const keys = Object.keys(obj);
  let i3 = keys.length;
  let _key;
  while (i3-- > 0) {
    _key = keys[i3];
    if (key === _key.toLowerCase()) {
      return _key;
    }
  }
  return null;
}
var _global = (() => {
  if (typeof globalThis !== "undefined") return globalThis;
  return typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : global;
})();
var isContextDefined = (context) => !isUndefined(context) && context !== _global;
function merge() {
  const { caseless, skipUndefined } = isContextDefined(this) && this || {};
  const result = {};
  const assignValue = (val, key) => {
    if (key === "__proto__" || key === "constructor" || key === "prototype") {
      return;
    }
    const targetKey = caseless && findKey(result, key) || key;
    if (isPlainObject(result[targetKey]) && isPlainObject(val)) {
      result[targetKey] = merge(result[targetKey], val);
    } else if (isPlainObject(val)) {
      result[targetKey] = merge({}, val);
    } else if (isArray(val)) {
      result[targetKey] = val.slice();
    } else if (!skipUndefined || !isUndefined(val)) {
      result[targetKey] = val;
    }
  };
  for (let i3 = 0, l3 = arguments.length; i3 < l3; i3++) {
    arguments[i3] && forEach(arguments[i3], assignValue);
  }
  return result;
}
var extend = (a3, b2, thisArg, { allOwnKeys } = {}) => {
  forEach(
    b2,
    (val, key) => {
      if (thisArg && isFunction(val)) {
        Object.defineProperty(a3, key, {
          value: bind(val, thisArg),
          writable: true,
          enumerable: true,
          configurable: true
        });
      } else {
        Object.defineProperty(a3, key, {
          value: val,
          writable: true,
          enumerable: true,
          configurable: true
        });
      }
    },
    { allOwnKeys }
  );
  return a3;
};
var stripBOM = (content) => {
  if (content.charCodeAt(0) === 65279) {
    content = content.slice(1);
  }
  return content;
};
var inherits = (constructor, superConstructor, props, descriptors) => {
  constructor.prototype = Object.create(superConstructor.prototype, descriptors);
  Object.defineProperty(constructor.prototype, "constructor", {
    value: constructor,
    writable: true,
    enumerable: false,
    configurable: true
  });
  Object.defineProperty(constructor, "super", {
    value: superConstructor.prototype
  });
  props && Object.assign(constructor.prototype, props);
};
var toFlatObject = (sourceObj, destObj, filter2, propFilter) => {
  let props;
  let i3;
  let prop;
  const merged = {};
  destObj = destObj || {};
  if (sourceObj == null) return destObj;
  do {
    props = Object.getOwnPropertyNames(sourceObj);
    i3 = props.length;
    while (i3-- > 0) {
      prop = props[i3];
      if ((!propFilter || propFilter(prop, sourceObj, destObj)) && !merged[prop]) {
        destObj[prop] = sourceObj[prop];
        merged[prop] = true;
      }
    }
    sourceObj = filter2 !== false && getPrototypeOf(sourceObj);
  } while (sourceObj && (!filter2 || filter2(sourceObj, destObj)) && sourceObj !== Object.prototype);
  return destObj;
};
var endsWith = (str, searchString, position) => {
  str = String(str);
  if (position === void 0 || position > str.length) {
    position = str.length;
  }
  position -= searchString.length;
  const lastIndex = str.indexOf(searchString, position);
  return lastIndex !== -1 && lastIndex === position;
};
var toArray = (thing) => {
  if (!thing) return null;
  if (isArray(thing)) return thing;
  let i3 = thing.length;
  if (!isNumber(i3)) return null;
  const arr = new Array(i3);
  while (i3-- > 0) {
    arr[i3] = thing[i3];
  }
  return arr;
};
var isTypedArray = /* @__PURE__ */ ((TypedArray) => {
  return (thing) => {
    return TypedArray && thing instanceof TypedArray;
  };
})(typeof Uint8Array !== "undefined" && getPrototypeOf(Uint8Array));
var forEachEntry = (obj, fn) => {
  const generator = obj && obj[iterator];
  const _iterator = generator.call(obj);
  let result;
  while ((result = _iterator.next()) && !result.done) {
    const pair = result.value;
    fn.call(obj, pair[0], pair[1]);
  }
};
var matchAll = (regExp, str) => {
  let matches;
  const arr = [];
  while ((matches = regExp.exec(str)) !== null) {
    arr.push(matches);
  }
  return arr;
};
var isHTMLForm = kindOfTest("HTMLFormElement");
var toCamelCase = (str) => {
  return str.toLowerCase().replace(/[-_\s]([a-z\d])(\w*)/g, function replacer(m3, p1, p22) {
    return p1.toUpperCase() + p22;
  });
};
var hasOwnProperty = (({ hasOwnProperty: hasOwnProperty2 }) => (obj, prop) => hasOwnProperty2.call(obj, prop))(Object.prototype);
var isRegExp = kindOfTest("RegExp");
var reduceDescriptors = (obj, reducer) => {
  const descriptors = Object.getOwnPropertyDescriptors(obj);
  const reducedDescriptors = {};
  forEach(descriptors, (descriptor, name) => {
    let ret;
    if ((ret = reducer(descriptor, name, obj)) !== false) {
      reducedDescriptors[name] = ret || descriptor;
    }
  });
  Object.defineProperties(obj, reducedDescriptors);
};
var freezeMethods = (obj) => {
  reduceDescriptors(obj, (descriptor, name) => {
    if (isFunction(obj) && ["arguments", "caller", "callee"].indexOf(name) !== -1) {
      return false;
    }
    const value = obj[name];
    if (!isFunction(value)) return;
    descriptor.enumerable = false;
    if ("writable" in descriptor) {
      descriptor.writable = false;
      return;
    }
    if (!descriptor.set) {
      descriptor.set = () => {
        throw Error("Can not rewrite read-only method '" + name + "'");
      };
    }
  });
};
var toObjectSet = (arrayOrString, delimiter) => {
  const obj = {};
  const define = (arr) => {
    arr.forEach((value) => {
      obj[value] = true;
    });
  };
  isArray(arrayOrString) ? define(arrayOrString) : define(String(arrayOrString).split(delimiter));
  return obj;
};
var noop = () => {
};
var toFiniteNumber = (value, defaultValue) => {
  return value != null && Number.isFinite(value = +value) ? value : defaultValue;
};
function isSpecCompliantForm(thing) {
  return !!(thing && isFunction(thing.append) && thing[toStringTag] === "FormData" && thing[iterator]);
}
var toJSONObject = (obj) => {
  const stack = new Array(10);
  const visit = (source, i3) => {
    if (isObject(source)) {
      if (stack.indexOf(source) >= 0) {
        return;
      }
      if (isBuffer(source)) {
        return source;
      }
      if (!("toJSON" in source)) {
        stack[i3] = source;
        const target = isArray(source) ? [] : {};
        forEach(source, (value, key) => {
          const reducedValue = visit(value, i3 + 1);
          !isUndefined(reducedValue) && (target[key] = reducedValue);
        });
        stack[i3] = void 0;
        return target;
      }
    }
    return source;
  };
  return visit(obj, 0);
};
var isAsyncFn = kindOfTest("AsyncFunction");
var isThenable = (thing) => thing && (isObject(thing) || isFunction(thing)) && isFunction(thing.then) && isFunction(thing.catch);
var _setImmediate = ((setImmediateSupported, postMessageSupported) => {
  if (setImmediateSupported) {
    return setImmediate;
  }
  return postMessageSupported ? ((token, callbacks) => {
    _global.addEventListener(
      "message",
      ({ source, data }) => {
        if (source === _global && data === token) {
          callbacks.length && callbacks.shift()();
        }
      },
      false
    );
    return (cb) => {
      callbacks.push(cb);
      _global.postMessage(token, "*");
    };
  })(`axios@${Math.random()}`, []) : (cb) => setTimeout(cb);
})(typeof setImmediate === "function", isFunction(_global.postMessage));
var asap = typeof queueMicrotask !== "undefined" ? queueMicrotask.bind(_global) : typeof process !== "undefined" && process.nextTick || _setImmediate;
var isIterable = (thing) => thing != null && isFunction(thing[iterator]);
var utils_default = {
  isArray,
  isArrayBuffer,
  isBuffer,
  isFormData,
  isArrayBufferView,
  isString,
  isNumber,
  isBoolean,
  isObject,
  isPlainObject,
  isEmptyObject,
  isReadableStream,
  isRequest,
  isResponse,
  isHeaders,
  isUndefined,
  isDate,
  isFile,
  isReactNativeBlob,
  isReactNative,
  isBlob,
  isRegExp,
  isFunction,
  isStream,
  isURLSearchParams,
  isTypedArray,
  isFileList,
  forEach,
  merge,
  extend,
  trim,
  stripBOM,
  inherits,
  toFlatObject,
  kindOf,
  kindOfTest,
  endsWith,
  toArray,
  forEachEntry,
  matchAll,
  isHTMLForm,
  hasOwnProperty,
  hasOwnProp: hasOwnProperty,
  // an alias to avoid ESLint no-prototype-builtins detection
  reduceDescriptors,
  freezeMethods,
  toObjectSet,
  toCamelCase,
  noop,
  toFiniteNumber,
  findKey,
  global: _global,
  isContextDefined,
  isSpecCompliantForm,
  toJSONObject,
  isAsyncFn,
  isThenable,
  setImmediate: _setImmediate,
  asap,
  isIterable
};

// node_modules/axios/lib/core/AxiosError.js
var AxiosError = class _AxiosError extends Error {
  static from(error, code, config, request, response, customProps) {
    const axiosError = new _AxiosError(error.message, code || error.code, config, request, response);
    axiosError.cause = error;
    axiosError.name = error.name;
    if (error.status != null && axiosError.status == null) {
      axiosError.status = error.status;
    }
    customProps && Object.assign(axiosError, customProps);
    return axiosError;
  }
  /**
   * Create an Error with the specified message, config, error code, request and response.
   *
   * @param {string} message The error message.
   * @param {string} [code] The error code (for example, 'ECONNABORTED').
   * @param {Object} [config] The config.
   * @param {Object} [request] The request.
   * @param {Object} [response] The response.
   *
   * @returns {Error} The created error.
   */
  constructor(message, code, config, request, response) {
    super(message);
    Object.defineProperty(this, "message", {
      value: message,
      enumerable: true,
      writable: true,
      configurable: true
    });
    this.name = "AxiosError";
    this.isAxiosError = true;
    code && (this.code = code);
    config && (this.config = config);
    request && (this.request = request);
    if (response) {
      this.response = response;
      this.status = response.status;
    }
  }
  toJSON() {
    return {
      // Standard
      message: this.message,
      name: this.name,
      // Microsoft
      description: this.description,
      number: this.number,
      // Mozilla
      fileName: this.fileName,
      lineNumber: this.lineNumber,
      columnNumber: this.columnNumber,
      stack: this.stack,
      // Axios
      config: utils_default.toJSONObject(this.config),
      code: this.code,
      status: this.status
    };
  }
};
AxiosError.ERR_BAD_OPTION_VALUE = "ERR_BAD_OPTION_VALUE";
AxiosError.ERR_BAD_OPTION = "ERR_BAD_OPTION";
AxiosError.ECONNABORTED = "ECONNABORTED";
AxiosError.ETIMEDOUT = "ETIMEDOUT";
AxiosError.ERR_NETWORK = "ERR_NETWORK";
AxiosError.ERR_FR_TOO_MANY_REDIRECTS = "ERR_FR_TOO_MANY_REDIRECTS";
AxiosError.ERR_DEPRECATED = "ERR_DEPRECATED";
AxiosError.ERR_BAD_RESPONSE = "ERR_BAD_RESPONSE";
AxiosError.ERR_BAD_REQUEST = "ERR_BAD_REQUEST";
AxiosError.ERR_CANCELED = "ERR_CANCELED";
AxiosError.ERR_NOT_SUPPORT = "ERR_NOT_SUPPORT";
AxiosError.ERR_INVALID_URL = "ERR_INVALID_URL";
AxiosError.ERR_FORM_DATA_DEPTH_EXCEEDED = "ERR_FORM_DATA_DEPTH_EXCEEDED";
var AxiosError_default = AxiosError;

// node_modules/axios/lib/helpers/null.js
var null_default = null;

// node_modules/axios/lib/helpers/toFormData.js
function isVisitable(thing) {
  return utils_default.isPlainObject(thing) || utils_default.isArray(thing);
}
function removeBrackets(key) {
  return utils_default.endsWith(key, "[]") ? key.slice(0, -2) : key;
}
function renderKey(path, key, dots) {
  if (!path) return key;
  return path.concat(key).map(function each(token, i3) {
    token = removeBrackets(token);
    return !dots && i3 ? "[" + token + "]" : token;
  }).join(dots ? "." : "");
}
function isFlatArray(arr) {
  return utils_default.isArray(arr) && !arr.some(isVisitable);
}
var predicates = utils_default.toFlatObject(utils_default, {}, null, function filter(prop) {
  return /^is[A-Z]/.test(prop);
});
function toFormData(obj, formData, options) {
  if (!utils_default.isObject(obj)) {
    throw new TypeError("target must be an object");
  }
  formData = formData || new (null_default || FormData)();
  options = utils_default.toFlatObject(
    options,
    {
      metaTokens: true,
      dots: false,
      indexes: false
    },
    false,
    function defined(option, source) {
      return !utils_default.isUndefined(source[option]);
    }
  );
  const metaTokens = options.metaTokens;
  const visitor = options.visitor || defaultVisitor;
  const dots = options.dots;
  const indexes = options.indexes;
  const _Blob = options.Blob || typeof Blob !== "undefined" && Blob;
  const maxDepth = options.maxDepth === void 0 ? 100 : options.maxDepth;
  const useBlob = _Blob && utils_default.isSpecCompliantForm(formData);
  if (!utils_default.isFunction(visitor)) {
    throw new TypeError("visitor must be a function");
  }
  function convertValue(value) {
    if (value === null) return "";
    if (utils_default.isDate(value)) {
      return value.toISOString();
    }
    if (utils_default.isBoolean(value)) {
      return value.toString();
    }
    if (!useBlob && utils_default.isBlob(value)) {
      throw new AxiosError_default("Blob is not supported. Use a Buffer instead.");
    }
    if (utils_default.isArrayBuffer(value) || utils_default.isTypedArray(value)) {
      return useBlob && typeof Blob === "function" ? new Blob([value]) : Buffer.from(value);
    }
    return value;
  }
  function defaultVisitor(value, key, path) {
    let arr = value;
    if (utils_default.isReactNative(formData) && utils_default.isReactNativeBlob(value)) {
      formData.append(renderKey(path, key, dots), convertValue(value));
      return false;
    }
    if (value && !path && typeof value === "object") {
      if (utils_default.endsWith(key, "{}")) {
        key = metaTokens ? key : key.slice(0, -2);
        value = JSON.stringify(value);
      } else if (utils_default.isArray(value) && isFlatArray(value) || (utils_default.isFileList(value) || utils_default.endsWith(key, "[]")) && (arr = utils_default.toArray(value))) {
        key = removeBrackets(key);
        arr.forEach(function each(el, index) {
          !(utils_default.isUndefined(el) || el === null) && formData.append(
            // eslint-disable-next-line no-nested-ternary
            indexes === true ? renderKey([key], index, dots) : indexes === null ? key : key + "[]",
            convertValue(el)
          );
        });
        return false;
      }
    }
    if (isVisitable(value)) {
      return true;
    }
    formData.append(renderKey(path, key, dots), convertValue(value));
    return false;
  }
  const stack = [];
  const exposedHelpers = Object.assign(predicates, {
    defaultVisitor,
    convertValue,
    isVisitable
  });
  function build(value, path, depth = 0) {
    if (utils_default.isUndefined(value)) return;
    if (depth > maxDepth) {
      throw new AxiosError_default(
        "Object is too deeply nested (" + depth + " levels). Max depth: " + maxDepth,
        AxiosError_default.ERR_FORM_DATA_DEPTH_EXCEEDED
      );
    }
    if (stack.indexOf(value) !== -1) {
      throw Error("Circular reference detected in " + path.join("."));
    }
    stack.push(value);
    utils_default.forEach(value, function each(el, key) {
      const result = !(utils_default.isUndefined(el) || el === null) && visitor.call(formData, el, utils_default.isString(key) ? key.trim() : key, path, exposedHelpers);
      if (result === true) {
        build(el, path ? path.concat(key) : [key], depth + 1);
      }
    });
    stack.pop();
  }
  if (!utils_default.isObject(obj)) {
    throw new TypeError("data must be an object");
  }
  build(obj);
  return formData;
}
var toFormData_default = toFormData;

// node_modules/axios/lib/helpers/AxiosURLSearchParams.js
function encode(str) {
  const charMap = {
    "!": "%21",
    "'": "%27",
    "(": "%28",
    ")": "%29",
    "~": "%7E",
    "%20": "+"
  };
  return encodeURIComponent(str).replace(/[!'()~]|%20/g, function replacer(match) {
    return charMap[match];
  });
}
function AxiosURLSearchParams(params, options) {
  this._pairs = [];
  params && toFormData_default(params, this, options);
}
var prototype = AxiosURLSearchParams.prototype;
prototype.append = function append(name, value) {
  this._pairs.push([name, value]);
};
prototype.toString = function toString2(encoder) {
  const _encode = encoder ? function(value) {
    return encoder.call(this, value, encode);
  } : encode;
  return this._pairs.map(function each(pair) {
    return _encode(pair[0]) + "=" + _encode(pair[1]);
  }, "").join("&");
};
var AxiosURLSearchParams_default = AxiosURLSearchParams;

// node_modules/axios/lib/helpers/buildURL.js
function encode2(val) {
  return encodeURIComponent(val).replace(/%3A/gi, ":").replace(/%24/g, "$").replace(/%2C/gi, ",").replace(/%20/g, "+");
}
function buildURL(url, params, options) {
  if (!params) {
    return url;
  }
  const _encode = options && options.encode || encode2;
  const _options = utils_default.isFunction(options) ? {
    serialize: options
  } : options;
  const serializeFn = _options && _options.serialize;
  let serializedParams;
  if (serializeFn) {
    serializedParams = serializeFn(params, _options);
  } else {
    serializedParams = utils_default.isURLSearchParams(params) ? params.toString() : new AxiosURLSearchParams_default(params, _options).toString(_encode);
  }
  if (serializedParams) {
    const hashmarkIndex = url.indexOf("#");
    if (hashmarkIndex !== -1) {
      url = url.slice(0, hashmarkIndex);
    }
    url += (url.indexOf("?") === -1 ? "?" : "&") + serializedParams;
  }
  return url;
}

// node_modules/axios/lib/core/InterceptorManager.js
var InterceptorManager = class {
  constructor() {
    this.handlers = [];
  }
  /**
   * Add a new interceptor to the stack
   *
   * @param {Function} fulfilled The function to handle `then` for a `Promise`
   * @param {Function} rejected The function to handle `reject` for a `Promise`
   * @param {Object} options The options for the interceptor, synchronous and runWhen
   *
   * @return {Number} An ID used to remove interceptor later
   */
  use(fulfilled, rejected, options) {
    this.handlers.push({
      fulfilled,
      rejected,
      synchronous: options ? options.synchronous : false,
      runWhen: options ? options.runWhen : null
    });
    return this.handlers.length - 1;
  }
  /**
   * Remove an interceptor from the stack
   *
   * @param {Number} id The ID that was returned by `use`
   *
   * @returns {void}
   */
  eject(id) {
    if (this.handlers[id]) {
      this.handlers[id] = null;
    }
  }
  /**
   * Clear all interceptors from the stack
   *
   * @returns {void}
   */
  clear() {
    if (this.handlers) {
      this.handlers = [];
    }
  }
  /**
   * Iterate over all the registered interceptors
   *
   * This method is particularly useful for skipping over any
   * interceptors that may have become `null` calling `eject`.
   *
   * @param {Function} fn The function to call for each interceptor
   *
   * @returns {void}
   */
  forEach(fn) {
    utils_default.forEach(this.handlers, function forEachHandler(h3) {
      if (h3 !== null) {
        fn(h3);
      }
    });
  }
};
var InterceptorManager_default = InterceptorManager;

// node_modules/axios/lib/defaults/transitional.js
var transitional_default = {
  silentJSONParsing: true,
  forcedJSONParsing: true,
  clarifyTimeoutError: false,
  legacyInterceptorReqResOrdering: true
};

// node_modules/axios/lib/platform/browser/classes/URLSearchParams.js
var URLSearchParams_default = typeof URLSearchParams !== "undefined" ? URLSearchParams : AxiosURLSearchParams_default;

// node_modules/axios/lib/platform/browser/classes/FormData.js
var FormData_default = typeof FormData !== "undefined" ? FormData : null;

// node_modules/axios/lib/platform/browser/classes/Blob.js
var Blob_default = typeof Blob !== "undefined" ? Blob : null;

// node_modules/axios/lib/platform/browser/index.js
var browser_default = {
  isBrowser: true,
  classes: {
    URLSearchParams: URLSearchParams_default,
    FormData: FormData_default,
    Blob: Blob_default
  },
  protocols: ["http", "https", "file", "blob", "url", "data"]
};

// node_modules/axios/lib/platform/common/utils.js
var utils_exports = {};
__export(utils_exports, {
  hasBrowserEnv: () => hasBrowserEnv,
  hasStandardBrowserEnv: () => hasStandardBrowserEnv,
  hasStandardBrowserWebWorkerEnv: () => hasStandardBrowserWebWorkerEnv,
  navigator: () => _navigator,
  origin: () => origin
});
var hasBrowserEnv = typeof window !== "undefined" && typeof document !== "undefined";
var _navigator = typeof navigator === "object" && navigator || void 0;
var hasStandardBrowserEnv = hasBrowserEnv && (!_navigator || ["ReactNative", "NativeScript", "NS"].indexOf(_navigator.product) < 0);
var hasStandardBrowserWebWorkerEnv = (() => {
  return typeof WorkerGlobalScope !== "undefined" && // eslint-disable-next-line no-undef
  self instanceof WorkerGlobalScope && typeof self.importScripts === "function";
})();
var origin = hasBrowserEnv && window.location.href || "http://localhost";

// node_modules/axios/lib/platform/index.js
var platform_default = {
  ...utils_exports,
  ...browser_default
};

// node_modules/axios/lib/helpers/toURLEncodedForm.js
function toURLEncodedForm(data, options) {
  return toFormData_default(data, new platform_default.classes.URLSearchParams(), {
    visitor: function(value, key, path, helpers) {
      if (platform_default.isNode && utils_default.isBuffer(value)) {
        this.append(key, value.toString("base64"));
        return false;
      }
      return helpers.defaultVisitor.apply(this, arguments);
    },
    ...options
  });
}

// node_modules/axios/lib/helpers/formDataToJSON.js
function parsePropPath(name) {
  return utils_default.matchAll(/\w+|\[(\w*)]/g, name).map((match) => {
    return match[0] === "[]" ? "" : match[1] || match[0];
  });
}
function arrayToObject(arr) {
  const obj = {};
  const keys = Object.keys(arr);
  let i3;
  const len = keys.length;
  let key;
  for (i3 = 0; i3 < len; i3++) {
    key = keys[i3];
    obj[key] = arr[key];
  }
  return obj;
}
function formDataToJSON(formData) {
  function buildPath(path, value, target, index) {
    let name = path[index++];
    if (name === "__proto__") return true;
    const isNumericKey = Number.isFinite(+name);
    const isLast = index >= path.length;
    name = !name && utils_default.isArray(target) ? target.length : name;
    if (isLast) {
      if (utils_default.hasOwnProp(target, name)) {
        target[name] = utils_default.isArray(target[name]) ? target[name].concat(value) : [target[name], value];
      } else {
        target[name] = value;
      }
      return !isNumericKey;
    }
    if (!target[name] || !utils_default.isObject(target[name])) {
      target[name] = [];
    }
    const result = buildPath(path, value, target[name], index);
    if (result && utils_default.isArray(target[name])) {
      target[name] = arrayToObject(target[name]);
    }
    return !isNumericKey;
  }
  if (utils_default.isFormData(formData) && utils_default.isFunction(formData.entries)) {
    const obj = {};
    utils_default.forEachEntry(formData, (name, value) => {
      buildPath(parsePropPath(name), value, obj, 0);
    });
    return obj;
  }
  return null;
}
var formDataToJSON_default = formDataToJSON;

// node_modules/axios/lib/defaults/index.js
var own = (obj, key) => obj != null && utils_default.hasOwnProp(obj, key) ? obj[key] : void 0;
function stringifySafely(rawValue, parser, encoder) {
  if (utils_default.isString(rawValue)) {
    try {
      (parser || JSON.parse)(rawValue);
      return utils_default.trim(rawValue);
    } catch (e3) {
      if (e3.name !== "SyntaxError") {
        throw e3;
      }
    }
  }
  return (encoder || JSON.stringify)(rawValue);
}
var defaults = {
  transitional: transitional_default,
  adapter: ["xhr", "http", "fetch"],
  transformRequest: [
    function transformRequest(data, headers) {
      const contentType = headers.getContentType() || "";
      const hasJSONContentType = contentType.indexOf("application/json") > -1;
      const isObjectPayload = utils_default.isObject(data);
      if (isObjectPayload && utils_default.isHTMLForm(data)) {
        data = new FormData(data);
      }
      const isFormData2 = utils_default.isFormData(data);
      if (isFormData2) {
        return hasJSONContentType ? JSON.stringify(formDataToJSON_default(data)) : data;
      }
      if (utils_default.isArrayBuffer(data) || utils_default.isBuffer(data) || utils_default.isStream(data) || utils_default.isFile(data) || utils_default.isBlob(data) || utils_default.isReadableStream(data)) {
        return data;
      }
      if (utils_default.isArrayBufferView(data)) {
        return data.buffer;
      }
      if (utils_default.isURLSearchParams(data)) {
        headers.setContentType("application/x-www-form-urlencoded;charset=utf-8", false);
        return data.toString();
      }
      let isFileList2;
      if (isObjectPayload) {
        const formSerializer = own(this, "formSerializer");
        if (contentType.indexOf("application/x-www-form-urlencoded") > -1) {
          return toURLEncodedForm(data, formSerializer).toString();
        }
        if ((isFileList2 = utils_default.isFileList(data)) || contentType.indexOf("multipart/form-data") > -1) {
          const env = own(this, "env");
          const _FormData = env && env.FormData;
          return toFormData_default(
            isFileList2 ? { "files[]": data } : data,
            _FormData && new _FormData(),
            formSerializer
          );
        }
      }
      if (isObjectPayload || hasJSONContentType) {
        headers.setContentType("application/json", false);
        return stringifySafely(data);
      }
      return data;
    }
  ],
  transformResponse: [
    function transformResponse(data) {
      const transitional2 = own(this, "transitional") || defaults.transitional;
      const forcedJSONParsing = transitional2 && transitional2.forcedJSONParsing;
      const responseType = own(this, "responseType");
      const JSONRequested = responseType === "json";
      if (utils_default.isResponse(data) || utils_default.isReadableStream(data)) {
        return data;
      }
      if (data && utils_default.isString(data) && (forcedJSONParsing && !responseType || JSONRequested)) {
        const silentJSONParsing = transitional2 && transitional2.silentJSONParsing;
        const strictJSONParsing = !silentJSONParsing && JSONRequested;
        try {
          return JSON.parse(data, own(this, "parseReviver"));
        } catch (e3) {
          if (strictJSONParsing) {
            if (e3.name === "SyntaxError") {
              throw AxiosError_default.from(e3, AxiosError_default.ERR_BAD_RESPONSE, this, null, own(this, "response"));
            }
            throw e3;
          }
        }
      }
      return data;
    }
  ],
  /**
   * A timeout in milliseconds to abort a request. If set to 0 (default) a
   * timeout is not created.
   */
  timeout: 0,
  xsrfCookieName: "XSRF-TOKEN",
  xsrfHeaderName: "X-XSRF-TOKEN",
  maxContentLength: -1,
  maxBodyLength: -1,
  env: {
    FormData: platform_default.classes.FormData,
    Blob: platform_default.classes.Blob
  },
  validateStatus: function validateStatus(status) {
    return status >= 200 && status < 300;
  },
  headers: {
    common: {
      Accept: "application/json, text/plain, */*",
      "Content-Type": void 0
    }
  }
};
utils_default.forEach(["delete", "get", "head", "post", "put", "patch"], (method) => {
  defaults.headers[method] = {};
});
var defaults_default = defaults;

// node_modules/axios/lib/helpers/parseHeaders.js
var ignoreDuplicateOf = utils_default.toObjectSet([
  "age",
  "authorization",
  "content-length",
  "content-type",
  "etag",
  "expires",
  "from",
  "host",
  "if-modified-since",
  "if-unmodified-since",
  "last-modified",
  "location",
  "max-forwards",
  "proxy-authorization",
  "referer",
  "retry-after",
  "user-agent"
]);
var parseHeaders_default = (rawHeaders) => {
  const parsed = {};
  let key;
  let val;
  let i3;
  rawHeaders && rawHeaders.split("\n").forEach(function parser(line) {
    i3 = line.indexOf(":");
    key = line.substring(0, i3).trim().toLowerCase();
    val = line.substring(i3 + 1).trim();
    if (!key || parsed[key] && ignoreDuplicateOf[key]) {
      return;
    }
    if (key === "set-cookie") {
      if (parsed[key]) {
        parsed[key].push(val);
      } else {
        parsed[key] = [val];
      }
    } else {
      parsed[key] = parsed[key] ? parsed[key] + ", " + val : val;
    }
  });
  return parsed;
};

// node_modules/axios/lib/core/AxiosHeaders.js
var $internals = Symbol("internals");
var INVALID_HEADER_VALUE_CHARS_RE = /[^\x09\x20-\x7E\x80-\xFF]/g;
function trimSPorHTAB(str) {
  let start = 0;
  let end = str.length;
  while (start < end) {
    const code = str.charCodeAt(start);
    if (code !== 9 && code !== 32) {
      break;
    }
    start += 1;
  }
  while (end > start) {
    const code = str.charCodeAt(end - 1);
    if (code !== 9 && code !== 32) {
      break;
    }
    end -= 1;
  }
  return start === 0 && end === str.length ? str : str.slice(start, end);
}
function normalizeHeader(header) {
  return header && String(header).trim().toLowerCase();
}
function sanitizeHeaderValue(str) {
  return trimSPorHTAB(str.replace(INVALID_HEADER_VALUE_CHARS_RE, ""));
}
function normalizeValue(value) {
  if (value === false || value == null) {
    return value;
  }
  return utils_default.isArray(value) ? value.map(normalizeValue) : sanitizeHeaderValue(String(value));
}
function parseTokens(str) {
  const tokens = /* @__PURE__ */ Object.create(null);
  const tokensRE = /([^\s,;=]+)\s*(?:=\s*([^,;]+))?/g;
  let match;
  while (match = tokensRE.exec(str)) {
    tokens[match[1]] = match[2];
  }
  return tokens;
}
var isValidHeaderName = (str) => /^[-_a-zA-Z0-9^`|~,!#$%&'*+.]+$/.test(str.trim());
function matchHeaderValue(context, value, header, filter2, isHeaderNameFilter) {
  if (utils_default.isFunction(filter2)) {
    return filter2.call(this, value, header);
  }
  if (isHeaderNameFilter) {
    value = header;
  }
  if (!utils_default.isString(value)) return;
  if (utils_default.isString(filter2)) {
    return value.indexOf(filter2) !== -1;
  }
  if (utils_default.isRegExp(filter2)) {
    return filter2.test(value);
  }
}
function formatHeader(header) {
  return header.trim().toLowerCase().replace(/([a-z\d])(\w*)/g, (w3, char, str) => {
    return char.toUpperCase() + str;
  });
}
function buildAccessors(obj, header) {
  const accessorName = utils_default.toCamelCase(" " + header);
  ["get", "set", "has"].forEach((methodName) => {
    Object.defineProperty(obj, methodName + accessorName, {
      value: function(arg1, arg2, arg3) {
        return this[methodName].call(this, header, arg1, arg2, arg3);
      },
      configurable: true
    });
  });
}
var AxiosHeaders = class {
  constructor(headers) {
    headers && this.set(headers);
  }
  set(header, valueOrRewrite, rewrite) {
    const self2 = this;
    function setHeader(_value, _header, _rewrite) {
      const lHeader = normalizeHeader(_header);
      if (!lHeader) {
        throw new Error("header name must be a non-empty string");
      }
      const key = utils_default.findKey(self2, lHeader);
      if (!key || self2[key] === void 0 || _rewrite === true || _rewrite === void 0 && self2[key] !== false) {
        self2[key || _header] = normalizeValue(_value);
      }
    }
    const setHeaders = (headers, _rewrite) => utils_default.forEach(headers, (_value, _header) => setHeader(_value, _header, _rewrite));
    if (utils_default.isPlainObject(header) || header instanceof this.constructor) {
      setHeaders(header, valueOrRewrite);
    } else if (utils_default.isString(header) && (header = header.trim()) && !isValidHeaderName(header)) {
      setHeaders(parseHeaders_default(header), valueOrRewrite);
    } else if (utils_default.isObject(header) && utils_default.isIterable(header)) {
      let obj = {}, dest, key;
      for (const entry of header) {
        if (!utils_default.isArray(entry)) {
          throw TypeError("Object iterator must return a key-value pair");
        }
        obj[key = entry[0]] = (dest = obj[key]) ? utils_default.isArray(dest) ? [...dest, entry[1]] : [dest, entry[1]] : entry[1];
      }
      setHeaders(obj, valueOrRewrite);
    } else {
      header != null && setHeader(valueOrRewrite, header, rewrite);
    }
    return this;
  }
  get(header, parser) {
    header = normalizeHeader(header);
    if (header) {
      const key = utils_default.findKey(this, header);
      if (key) {
        const value = this[key];
        if (!parser) {
          return value;
        }
        if (parser === true) {
          return parseTokens(value);
        }
        if (utils_default.isFunction(parser)) {
          return parser.call(this, value, key);
        }
        if (utils_default.isRegExp(parser)) {
          return parser.exec(value);
        }
        throw new TypeError("parser must be boolean|regexp|function");
      }
    }
  }
  has(header, matcher) {
    header = normalizeHeader(header);
    if (header) {
      const key = utils_default.findKey(this, header);
      return !!(key && this[key] !== void 0 && (!matcher || matchHeaderValue(this, this[key], key, matcher)));
    }
    return false;
  }
  delete(header, matcher) {
    const self2 = this;
    let deleted = false;
    function deleteHeader(_header) {
      _header = normalizeHeader(_header);
      if (_header) {
        const key = utils_default.findKey(self2, _header);
        if (key && (!matcher || matchHeaderValue(self2, self2[key], key, matcher))) {
          delete self2[key];
          deleted = true;
        }
      }
    }
    if (utils_default.isArray(header)) {
      header.forEach(deleteHeader);
    } else {
      deleteHeader(header);
    }
    return deleted;
  }
  clear(matcher) {
    const keys = Object.keys(this);
    let i3 = keys.length;
    let deleted = false;
    while (i3--) {
      const key = keys[i3];
      if (!matcher || matchHeaderValue(this, this[key], key, matcher, true)) {
        delete this[key];
        deleted = true;
      }
    }
    return deleted;
  }
  normalize(format) {
    const self2 = this;
    const headers = {};
    utils_default.forEach(this, (value, header) => {
      const key = utils_default.findKey(headers, header);
      if (key) {
        self2[key] = normalizeValue(value);
        delete self2[header];
        return;
      }
      const normalized = format ? formatHeader(header) : String(header).trim();
      if (normalized !== header) {
        delete self2[header];
      }
      self2[normalized] = normalizeValue(value);
      headers[normalized] = true;
    });
    return this;
  }
  concat(...targets) {
    return this.constructor.concat(this, ...targets);
  }
  toJSON(asStrings) {
    const obj = /* @__PURE__ */ Object.create(null);
    utils_default.forEach(this, (value, header) => {
      value != null && value !== false && (obj[header] = asStrings && utils_default.isArray(value) ? value.join(", ") : value);
    });
    return obj;
  }
  [Symbol.iterator]() {
    return Object.entries(this.toJSON())[Symbol.iterator]();
  }
  toString() {
    return Object.entries(this.toJSON()).map(([header, value]) => header + ": " + value).join("\n");
  }
  getSetCookie() {
    return this.get("set-cookie") || [];
  }
  get [Symbol.toStringTag]() {
    return "AxiosHeaders";
  }
  static from(thing) {
    return thing instanceof this ? thing : new this(thing);
  }
  static concat(first, ...targets) {
    const computed = new this(first);
    targets.forEach((target) => computed.set(target));
    return computed;
  }
  static accessor(header) {
    const internals = this[$internals] = this[$internals] = {
      accessors: {}
    };
    const accessors = internals.accessors;
    const prototype2 = this.prototype;
    function defineAccessor(_header) {
      const lHeader = normalizeHeader(_header);
      if (!accessors[lHeader]) {
        buildAccessors(prototype2, _header);
        accessors[lHeader] = true;
      }
    }
    utils_default.isArray(header) ? header.forEach(defineAccessor) : defineAccessor(header);
    return this;
  }
};
AxiosHeaders.accessor([
  "Content-Type",
  "Content-Length",
  "Accept",
  "Accept-Encoding",
  "User-Agent",
  "Authorization"
]);
utils_default.reduceDescriptors(AxiosHeaders.prototype, ({ value }, key) => {
  let mapped = key[0].toUpperCase() + key.slice(1);
  return {
    get: () => value,
    set(headerValue) {
      this[mapped] = headerValue;
    }
  };
});
utils_default.freezeMethods(AxiosHeaders);
var AxiosHeaders_default = AxiosHeaders;

// node_modules/axios/lib/core/transformData.js
function transformData(fns, response) {
  const config = this || defaults_default;
  const context = response || config;
  const headers = AxiosHeaders_default.from(context.headers);
  let data = context.data;
  utils_default.forEach(fns, function transform(fn) {
    data = fn.call(config, data, headers.normalize(), response ? response.status : void 0);
  });
  headers.normalize();
  return data;
}

// node_modules/axios/lib/cancel/isCancel.js
function isCancel(value) {
  return !!(value && value.__CANCEL__);
}

// node_modules/axios/lib/cancel/CanceledError.js
var CanceledError = class extends AxiosError_default {
  /**
   * A `CanceledError` is an object that is thrown when an operation is canceled.
   *
   * @param {string=} message The message.
   * @param {Object=} config The config.
   * @param {Object=} request The request.
   *
   * @returns {CanceledError} The created error.
   */
  constructor(message, config, request) {
    super(message == null ? "canceled" : message, AxiosError_default.ERR_CANCELED, config, request);
    this.name = "CanceledError";
    this.__CANCEL__ = true;
  }
};
var CanceledError_default = CanceledError;

// node_modules/axios/lib/core/settle.js
function settle(resolve, reject, response) {
  const validateStatus2 = response.config.validateStatus;
  if (!response.status || !validateStatus2 || validateStatus2(response.status)) {
    resolve(response);
  } else {
    reject(
      new AxiosError_default(
        "Request failed with status code " + response.status,
        [AxiosError_default.ERR_BAD_REQUEST, AxiosError_default.ERR_BAD_RESPONSE][Math.floor(response.status / 100) - 4],
        response.config,
        response.request,
        response
      )
    );
  }
}

// node_modules/axios/lib/helpers/parseProtocol.js
function parseProtocol(url) {
  const match = /^([-+\w]{1,25})(:?\/\/|:)/.exec(url);
  return match && match[1] || "";
}

// node_modules/axios/lib/helpers/speedometer.js
function speedometer(samplesCount, min) {
  samplesCount = samplesCount || 10;
  const bytes = new Array(samplesCount);
  const timestamps = new Array(samplesCount);
  let head = 0;
  let tail = 0;
  let firstSampleTS;
  min = min !== void 0 ? min : 1e3;
  return function push(chunkLength) {
    const now = Date.now();
    const startedAt = timestamps[tail];
    if (!firstSampleTS) {
      firstSampleTS = now;
    }
    bytes[head] = chunkLength;
    timestamps[head] = now;
    let i3 = tail;
    let bytesCount = 0;
    while (i3 !== head) {
      bytesCount += bytes[i3++];
      i3 = i3 % samplesCount;
    }
    head = (head + 1) % samplesCount;
    if (head === tail) {
      tail = (tail + 1) % samplesCount;
    }
    if (now - firstSampleTS < min) {
      return;
    }
    const passed = startedAt && now - startedAt;
    return passed ? Math.round(bytesCount * 1e3 / passed) : void 0;
  };
}
var speedometer_default = speedometer;

// node_modules/axios/lib/helpers/throttle.js
function throttle(fn, freq) {
  let timestamp = 0;
  let threshold = 1e3 / freq;
  let lastArgs;
  let timer;
  const invoke = (args, now = Date.now()) => {
    timestamp = now;
    lastArgs = null;
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
    fn(...args);
  };
  const throttled = (...args) => {
    const now = Date.now();
    const passed = now - timestamp;
    if (passed >= threshold) {
      invoke(args, now);
    } else {
      lastArgs = args;
      if (!timer) {
        timer = setTimeout(() => {
          timer = null;
          invoke(lastArgs);
        }, threshold - passed);
      }
    }
  };
  const flush = () => lastArgs && invoke(lastArgs);
  return [throttled, flush];
}
var throttle_default = throttle;

// node_modules/axios/lib/helpers/progressEventReducer.js
var progressEventReducer = (listener, isDownloadStream, freq = 3) => {
  let bytesNotified = 0;
  const _speedometer = speedometer_default(50, 250);
  return throttle_default((e3) => {
    const rawLoaded = e3.loaded;
    const total = e3.lengthComputable ? e3.total : void 0;
    const loaded = total != null ? Math.min(rawLoaded, total) : rawLoaded;
    const progressBytes = Math.max(0, loaded - bytesNotified);
    const rate = _speedometer(progressBytes);
    bytesNotified = Math.max(bytesNotified, loaded);
    const data = {
      loaded,
      total,
      progress: total ? loaded / total : void 0,
      bytes: progressBytes,
      rate: rate ? rate : void 0,
      estimated: rate && total ? (total - loaded) / rate : void 0,
      event: e3,
      lengthComputable: total != null,
      [isDownloadStream ? "download" : "upload"]: true
    };
    listener(data);
  }, freq);
};
var progressEventDecorator = (total, throttled) => {
  const lengthComputable = total != null;
  return [
    (loaded) => throttled[0]({
      lengthComputable,
      total,
      loaded
    }),
    throttled[1]
  ];
};
var asyncDecorator = (fn) => (...args) => utils_default.asap(() => fn(...args));

// node_modules/axios/lib/helpers/isURLSameOrigin.js
var isURLSameOrigin_default = platform_default.hasStandardBrowserEnv ? /* @__PURE__ */ ((origin2, isMSIE) => (url) => {
  url = new URL(url, platform_default.origin);
  return origin2.protocol === url.protocol && origin2.host === url.host && (isMSIE || origin2.port === url.port);
})(
  new URL(platform_default.origin),
  platform_default.navigator && /(msie|trident)/i.test(platform_default.navigator.userAgent)
) : () => true;

// node_modules/axios/lib/helpers/cookies.js
var cookies_default = platform_default.hasStandardBrowserEnv ? (
  // Standard browser envs support document.cookie
  {
    write(name, value, expires, path, domain, secure, sameSite) {
      if (typeof document === "undefined") return;
      const cookie = [`${name}=${encodeURIComponent(value)}`];
      if (utils_default.isNumber(expires)) {
        cookie.push(`expires=${new Date(expires).toUTCString()}`);
      }
      if (utils_default.isString(path)) {
        cookie.push(`path=${path}`);
      }
      if (utils_default.isString(domain)) {
        cookie.push(`domain=${domain}`);
      }
      if (secure === true) {
        cookie.push("secure");
      }
      if (utils_default.isString(sameSite)) {
        cookie.push(`SameSite=${sameSite}`);
      }
      document.cookie = cookie.join("; ");
    },
    read(name) {
      if (typeof document === "undefined") return null;
      const match = document.cookie.match(new RegExp("(?:^|; )" + name + "=([^;]*)"));
      return match ? decodeURIComponent(match[1]) : null;
    },
    remove(name) {
      this.write(name, "", Date.now() - 864e5, "/");
    }
  }
) : (
  // Non-standard browser env (web workers, react-native) lack needed support.
  {
    write() {
    },
    read() {
      return null;
    },
    remove() {
    }
  }
);

// node_modules/axios/lib/helpers/isAbsoluteURL.js
function isAbsoluteURL(url) {
  if (typeof url !== "string") {
    return false;
  }
  return /^([a-z][a-z\d+\-.]*:)?\/\//i.test(url);
}

// node_modules/axios/lib/helpers/combineURLs.js
function combineURLs(baseURL, relativeURL) {
  return relativeURL ? baseURL.replace(/\/?\/$/, "") + "/" + relativeURL.replace(/^\/+/, "") : baseURL;
}

// node_modules/axios/lib/core/buildFullPath.js
function buildFullPath(baseURL, requestedURL, allowAbsoluteUrls) {
  let isRelativeUrl = !isAbsoluteURL(requestedURL);
  if (baseURL && (isRelativeUrl || allowAbsoluteUrls === false)) {
    return combineURLs(baseURL, requestedURL);
  }
  return requestedURL;
}

// node_modules/axios/lib/core/mergeConfig.js
var headersToObject = (thing) => thing instanceof AxiosHeaders_default ? { ...thing } : thing;
function mergeConfig(config1, config2) {
  config2 = config2 || {};
  const config = /* @__PURE__ */ Object.create(null);
  Object.defineProperty(config, "hasOwnProperty", {
    value: Object.prototype.hasOwnProperty,
    enumerable: false,
    writable: true,
    configurable: true
  });
  function getMergedValue(target, source, prop, caseless) {
    if (utils_default.isPlainObject(target) && utils_default.isPlainObject(source)) {
      return utils_default.merge.call({ caseless }, target, source);
    } else if (utils_default.isPlainObject(source)) {
      return utils_default.merge({}, source);
    } else if (utils_default.isArray(source)) {
      return source.slice();
    }
    return source;
  }
  function mergeDeepProperties(a3, b2, prop, caseless) {
    if (!utils_default.isUndefined(b2)) {
      return getMergedValue(a3, b2, prop, caseless);
    } else if (!utils_default.isUndefined(a3)) {
      return getMergedValue(void 0, a3, prop, caseless);
    }
  }
  function valueFromConfig2(a3, b2) {
    if (!utils_default.isUndefined(b2)) {
      return getMergedValue(void 0, b2);
    }
  }
  function defaultToConfig2(a3, b2) {
    if (!utils_default.isUndefined(b2)) {
      return getMergedValue(void 0, b2);
    } else if (!utils_default.isUndefined(a3)) {
      return getMergedValue(void 0, a3);
    }
  }
  function mergeDirectKeys(a3, b2, prop) {
    if (utils_default.hasOwnProp(config2, prop)) {
      return getMergedValue(a3, b2);
    } else if (utils_default.hasOwnProp(config1, prop)) {
      return getMergedValue(void 0, a3);
    }
  }
  const mergeMap = {
    url: valueFromConfig2,
    method: valueFromConfig2,
    data: valueFromConfig2,
    baseURL: defaultToConfig2,
    transformRequest: defaultToConfig2,
    transformResponse: defaultToConfig2,
    paramsSerializer: defaultToConfig2,
    timeout: defaultToConfig2,
    timeoutMessage: defaultToConfig2,
    withCredentials: defaultToConfig2,
    withXSRFToken: defaultToConfig2,
    adapter: defaultToConfig2,
    responseType: defaultToConfig2,
    xsrfCookieName: defaultToConfig2,
    xsrfHeaderName: defaultToConfig2,
    onUploadProgress: defaultToConfig2,
    onDownloadProgress: defaultToConfig2,
    decompress: defaultToConfig2,
    maxContentLength: defaultToConfig2,
    maxBodyLength: defaultToConfig2,
    beforeRedirect: defaultToConfig2,
    transport: defaultToConfig2,
    httpAgent: defaultToConfig2,
    httpsAgent: defaultToConfig2,
    cancelToken: defaultToConfig2,
    socketPath: defaultToConfig2,
    allowedSocketPaths: defaultToConfig2,
    responseEncoding: defaultToConfig2,
    validateStatus: mergeDirectKeys,
    headers: (a3, b2, prop) => mergeDeepProperties(headersToObject(a3), headersToObject(b2), prop, true)
  };
  utils_default.forEach(Object.keys({ ...config1, ...config2 }), function computeConfigValue(prop) {
    if (prop === "__proto__" || prop === "constructor" || prop === "prototype") return;
    const merge2 = utils_default.hasOwnProp(mergeMap, prop) ? mergeMap[prop] : mergeDeepProperties;
    const a3 = utils_default.hasOwnProp(config1, prop) ? config1[prop] : void 0;
    const b2 = utils_default.hasOwnProp(config2, prop) ? config2[prop] : void 0;
    const configValue = merge2(a3, b2, prop);
    utils_default.isUndefined(configValue) && merge2 !== mergeDirectKeys || (config[prop] = configValue);
  });
  return config;
}

// node_modules/axios/lib/helpers/resolveConfig.js
var resolveConfig_default = (config) => {
  const newConfig = mergeConfig({}, config);
  const own2 = (key) => utils_default.hasOwnProp(newConfig, key) ? newConfig[key] : void 0;
  const data = own2("data");
  let withXSRFToken = own2("withXSRFToken");
  const xsrfHeaderName = own2("xsrfHeaderName");
  const xsrfCookieName = own2("xsrfCookieName");
  let headers = own2("headers");
  const auth = own2("auth");
  const baseURL = own2("baseURL");
  const allowAbsoluteUrls = own2("allowAbsoluteUrls");
  const url = own2("url");
  newConfig.headers = headers = AxiosHeaders_default.from(headers);
  newConfig.url = buildURL(
    buildFullPath(baseURL, url, allowAbsoluteUrls),
    config.params,
    config.paramsSerializer
  );
  if (auth) {
    headers.set(
      "Authorization",
      "Basic " + btoa(
        (auth.username || "") + ":" + (auth.password ? unescape(encodeURIComponent(auth.password)) : "")
      )
    );
  }
  if (utils_default.isFormData(data)) {
    if (platform_default.hasStandardBrowserEnv || platform_default.hasStandardBrowserWebWorkerEnv) {
      headers.setContentType(void 0);
    } else if (utils_default.isFunction(data.getHeaders)) {
      const formHeaders = data.getHeaders();
      const allowedHeaders = ["content-type", "content-length"];
      Object.entries(formHeaders).forEach(([key, val]) => {
        if (allowedHeaders.includes(key.toLowerCase())) {
          headers.set(key, val);
        }
      });
    }
  }
  if (platform_default.hasStandardBrowserEnv) {
    if (utils_default.isFunction(withXSRFToken)) {
      withXSRFToken = withXSRFToken(newConfig);
    }
    const shouldSendXSRF = withXSRFToken === true || withXSRFToken == null && isURLSameOrigin_default(newConfig.url);
    if (shouldSendXSRF) {
      const xsrfValue = xsrfHeaderName && xsrfCookieName && cookies_default.read(xsrfCookieName);
      if (xsrfValue) {
        headers.set(xsrfHeaderName, xsrfValue);
      }
    }
  }
  return newConfig;
};

// node_modules/axios/lib/adapters/xhr.js
var isXHRAdapterSupported = typeof XMLHttpRequest !== "undefined";
var xhr_default = isXHRAdapterSupported && function(config) {
  return new Promise(function dispatchXhrRequest(resolve, reject) {
    const _config = resolveConfig_default(config);
    let requestData = _config.data;
    const requestHeaders = AxiosHeaders_default.from(_config.headers).normalize();
    let { responseType, onUploadProgress, onDownloadProgress } = _config;
    let onCanceled;
    let uploadThrottled, downloadThrottled;
    let flushUpload, flushDownload;
    function done() {
      flushUpload && flushUpload();
      flushDownload && flushDownload();
      _config.cancelToken && _config.cancelToken.unsubscribe(onCanceled);
      _config.signal && _config.signal.removeEventListener("abort", onCanceled);
    }
    let request = new XMLHttpRequest();
    request.open(_config.method.toUpperCase(), _config.url, true);
    request.timeout = _config.timeout;
    function onloadend() {
      if (!request) {
        return;
      }
      const responseHeaders = AxiosHeaders_default.from(
        "getAllResponseHeaders" in request && request.getAllResponseHeaders()
      );
      const responseData = !responseType || responseType === "text" || responseType === "json" ? request.responseText : request.response;
      const response = {
        data: responseData,
        status: request.status,
        statusText: request.statusText,
        headers: responseHeaders,
        config,
        request
      };
      settle(
        function _resolve(value) {
          resolve(value);
          done();
        },
        function _reject(err) {
          reject(err);
          done();
        },
        response
      );
      request = null;
    }
    if ("onloadend" in request) {
      request.onloadend = onloadend;
    } else {
      request.onreadystatechange = function handleLoad() {
        if (!request || request.readyState !== 4) {
          return;
        }
        if (request.status === 0 && !(request.responseURL && request.responseURL.indexOf("file:") === 0)) {
          return;
        }
        setTimeout(onloadend);
      };
    }
    request.onabort = function handleAbort() {
      if (!request) {
        return;
      }
      reject(new AxiosError_default("Request aborted", AxiosError_default.ECONNABORTED, config, request));
      request = null;
    };
    request.onerror = function handleError(event) {
      const msg = event && event.message ? event.message : "Network Error";
      const err = new AxiosError_default(msg, AxiosError_default.ERR_NETWORK, config, request);
      err.event = event || null;
      reject(err);
      request = null;
    };
    request.ontimeout = function handleTimeout() {
      let timeoutErrorMessage = _config.timeout ? "timeout of " + _config.timeout + "ms exceeded" : "timeout exceeded";
      const transitional2 = _config.transitional || transitional_default;
      if (_config.timeoutErrorMessage) {
        timeoutErrorMessage = _config.timeoutErrorMessage;
      }
      reject(
        new AxiosError_default(
          timeoutErrorMessage,
          transitional2.clarifyTimeoutError ? AxiosError_default.ETIMEDOUT : AxiosError_default.ECONNABORTED,
          config,
          request
        )
      );
      request = null;
    };
    requestData === void 0 && requestHeaders.setContentType(null);
    if ("setRequestHeader" in request) {
      utils_default.forEach(requestHeaders.toJSON(), function setRequestHeader(val, key) {
        request.setRequestHeader(key, val);
      });
    }
    if (!utils_default.isUndefined(_config.withCredentials)) {
      request.withCredentials = !!_config.withCredentials;
    }
    if (responseType && responseType !== "json") {
      request.responseType = _config.responseType;
    }
    if (onDownloadProgress) {
      [downloadThrottled, flushDownload] = progressEventReducer(onDownloadProgress, true);
      request.addEventListener("progress", downloadThrottled);
    }
    if (onUploadProgress && request.upload) {
      [uploadThrottled, flushUpload] = progressEventReducer(onUploadProgress);
      request.upload.addEventListener("progress", uploadThrottled);
      request.upload.addEventListener("loadend", flushUpload);
    }
    if (_config.cancelToken || _config.signal) {
      onCanceled = (cancel) => {
        if (!request) {
          return;
        }
        reject(!cancel || cancel.type ? new CanceledError_default(null, config, request) : cancel);
        request.abort();
        request = null;
      };
      _config.cancelToken && _config.cancelToken.subscribe(onCanceled);
      if (_config.signal) {
        _config.signal.aborted ? onCanceled() : _config.signal.addEventListener("abort", onCanceled);
      }
    }
    const protocol = parseProtocol(_config.url);
    if (protocol && platform_default.protocols.indexOf(protocol) === -1) {
      reject(
        new AxiosError_default(
          "Unsupported protocol " + protocol + ":",
          AxiosError_default.ERR_BAD_REQUEST,
          config
        )
      );
      return;
    }
    request.send(requestData || null);
  });
};

// node_modules/axios/lib/helpers/composeSignals.js
var composeSignals = (signals, timeout) => {
  const { length } = signals = signals ? signals.filter(Boolean) : [];
  if (timeout || length) {
    let controller = new AbortController();
    let aborted;
    const onabort = function(reason) {
      if (!aborted) {
        aborted = true;
        unsubscribe();
        const err = reason instanceof Error ? reason : this.reason;
        controller.abort(
          err instanceof AxiosError_default ? err : new CanceledError_default(err instanceof Error ? err.message : err)
        );
      }
    };
    let timer = timeout && setTimeout(() => {
      timer = null;
      onabort(new AxiosError_default(`timeout of ${timeout}ms exceeded`, AxiosError_default.ETIMEDOUT));
    }, timeout);
    const unsubscribe = () => {
      if (signals) {
        timer && clearTimeout(timer);
        timer = null;
        signals.forEach((signal2) => {
          signal2.unsubscribe ? signal2.unsubscribe(onabort) : signal2.removeEventListener("abort", onabort);
        });
        signals = null;
      }
    };
    signals.forEach((signal2) => signal2.addEventListener("abort", onabort));
    const { signal } = controller;
    signal.unsubscribe = () => utils_default.asap(unsubscribe);
    return signal;
  }
};
var composeSignals_default = composeSignals;

// node_modules/axios/lib/helpers/trackStream.js
var streamChunk = function* (chunk, chunkSize) {
  let len = chunk.byteLength;
  if (!chunkSize || len < chunkSize) {
    yield chunk;
    return;
  }
  let pos = 0;
  let end;
  while (pos < len) {
    end = pos + chunkSize;
    yield chunk.slice(pos, end);
    pos = end;
  }
};
var readBytes = async function* (iterable, chunkSize) {
  for await (const chunk of readStream(iterable)) {
    yield* streamChunk(chunk, chunkSize);
  }
};
var readStream = async function* (stream) {
  if (stream[Symbol.asyncIterator]) {
    yield* stream;
    return;
  }
  const reader = stream.getReader();
  try {
    for (; ; ) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }
      yield value;
    }
  } finally {
    await reader.cancel();
  }
};
var trackStream = (stream, chunkSize, onProgress, onFinish) => {
  const iterator2 = readBytes(stream, chunkSize);
  let bytes = 0;
  let done;
  let _onFinish = (e3) => {
    if (!done) {
      done = true;
      onFinish && onFinish(e3);
    }
  };
  return new ReadableStream(
    {
      async pull(controller) {
        try {
          const { done: done2, value } = await iterator2.next();
          if (done2) {
            _onFinish();
            controller.close();
            return;
          }
          let len = value.byteLength;
          if (onProgress) {
            let loadedBytes = bytes += len;
            onProgress(loadedBytes);
          }
          controller.enqueue(new Uint8Array(value));
        } catch (err) {
          _onFinish(err);
          throw err;
        }
      },
      cancel(reason) {
        _onFinish(reason);
        return iterator2.return();
      }
    },
    {
      highWaterMark: 2
    }
  );
};

// node_modules/axios/lib/adapters/fetch.js
var DEFAULT_CHUNK_SIZE = 64 * 1024;
var { isFunction: isFunction2 } = utils_default;
var globalFetchAPI = (({ Request, Response }) => ({
  Request,
  Response
}))(utils_default.global);
var { ReadableStream: ReadableStream2, TextEncoder } = utils_default.global;
var test = (fn, ...args) => {
  try {
    return !!fn(...args);
  } catch (e3) {
    return false;
  }
};
var factory = (env) => {
  env = utils_default.merge.call(
    {
      skipUndefined: true
    },
    globalFetchAPI,
    env
  );
  const { fetch: envFetch, Request, Response } = env;
  const isFetchSupported = envFetch ? isFunction2(envFetch) : typeof fetch === "function";
  const isRequestSupported = isFunction2(Request);
  const isResponseSupported = isFunction2(Response);
  if (!isFetchSupported) {
    return false;
  }
  const isReadableStreamSupported = isFetchSupported && isFunction2(ReadableStream2);
  const encodeText = isFetchSupported && (typeof TextEncoder === "function" ? /* @__PURE__ */ ((encoder) => (str) => encoder.encode(str))(new TextEncoder()) : async (str) => new Uint8Array(await new Request(str).arrayBuffer()));
  const supportsRequestStream = isRequestSupported && isReadableStreamSupported && test(() => {
    let duplexAccessed = false;
    const request = new Request(platform_default.origin, {
      body: new ReadableStream2(),
      method: "POST",
      get duplex() {
        duplexAccessed = true;
        return "half";
      }
    });
    const hasContentType = request.headers.has("Content-Type");
    if (request.body != null) {
      request.body.cancel();
    }
    return duplexAccessed && !hasContentType;
  });
  const supportsResponseStream = isResponseSupported && isReadableStreamSupported && test(() => utils_default.isReadableStream(new Response("").body));
  const resolvers = {
    stream: supportsResponseStream && ((res) => res.body)
  };
  isFetchSupported && (() => {
    ["text", "arrayBuffer", "blob", "formData", "stream"].forEach((type) => {
      !resolvers[type] && (resolvers[type] = (res, config) => {
        let method = res && res[type];
        if (method) {
          return method.call(res);
        }
        throw new AxiosError_default(
          `Response type '${type}' is not supported`,
          AxiosError_default.ERR_NOT_SUPPORT,
          config
        );
      });
    });
  })();
  const getBodyLength = async (body) => {
    if (body == null) {
      return 0;
    }
    if (utils_default.isBlob(body)) {
      return body.size;
    }
    if (utils_default.isSpecCompliantForm(body)) {
      const _request = new Request(platform_default.origin, {
        method: "POST",
        body
      });
      return (await _request.arrayBuffer()).byteLength;
    }
    if (utils_default.isArrayBufferView(body) || utils_default.isArrayBuffer(body)) {
      return body.byteLength;
    }
    if (utils_default.isURLSearchParams(body)) {
      body = body + "";
    }
    if (utils_default.isString(body)) {
      return (await encodeText(body)).byteLength;
    }
  };
  const resolveBodyLength = async (headers, body) => {
    const length = utils_default.toFiniteNumber(headers.getContentLength());
    return length == null ? getBodyLength(body) : length;
  };
  return async (config) => {
    let {
      url,
      method,
      data,
      signal,
      cancelToken,
      timeout,
      onDownloadProgress,
      onUploadProgress,
      responseType,
      headers,
      withCredentials = "same-origin",
      fetchOptions
    } = resolveConfig_default(config);
    let _fetch = envFetch || fetch;
    responseType = responseType ? (responseType + "").toLowerCase() : "text";
    let composedSignal = composeSignals_default(
      [signal, cancelToken && cancelToken.toAbortSignal()],
      timeout
    );
    let request = null;
    const unsubscribe = composedSignal && composedSignal.unsubscribe && (() => {
      composedSignal.unsubscribe();
    });
    let requestContentLength;
    try {
      if (onUploadProgress && supportsRequestStream && method !== "get" && method !== "head" && (requestContentLength = await resolveBodyLength(headers, data)) !== 0) {
        let _request = new Request(url, {
          method: "POST",
          body: data,
          duplex: "half"
        });
        let contentTypeHeader;
        if (utils_default.isFormData(data) && (contentTypeHeader = _request.headers.get("content-type"))) {
          headers.setContentType(contentTypeHeader);
        }
        if (_request.body) {
          const [onProgress, flush] = progressEventDecorator(
            requestContentLength,
            progressEventReducer(asyncDecorator(onUploadProgress))
          );
          data = trackStream(_request.body, DEFAULT_CHUNK_SIZE, onProgress, flush);
        }
      }
      if (!utils_default.isString(withCredentials)) {
        withCredentials = withCredentials ? "include" : "omit";
      }
      const isCredentialsSupported = isRequestSupported && "credentials" in Request.prototype;
      if (utils_default.isFormData(data)) {
        const contentType = headers.getContentType();
        if (contentType && /^multipart\/form-data/i.test(contentType) && !/boundary=/i.test(contentType)) {
          headers.delete("content-type");
        }
      }
      const resolvedOptions = {
        ...fetchOptions,
        signal: composedSignal,
        method: method.toUpperCase(),
        headers: headers.normalize().toJSON(),
        body: data,
        duplex: "half",
        credentials: isCredentialsSupported ? withCredentials : void 0
      };
      request = isRequestSupported && new Request(url, resolvedOptions);
      let response = await (isRequestSupported ? _fetch(request, fetchOptions) : _fetch(url, resolvedOptions));
      const isStreamResponse = supportsResponseStream && (responseType === "stream" || responseType === "response");
      if (supportsResponseStream && (onDownloadProgress || isStreamResponse && unsubscribe)) {
        const options = {};
        ["status", "statusText", "headers"].forEach((prop) => {
          options[prop] = response[prop];
        });
        const responseContentLength = utils_default.toFiniteNumber(response.headers.get("content-length"));
        const [onProgress, flush] = onDownloadProgress && progressEventDecorator(
          responseContentLength,
          progressEventReducer(asyncDecorator(onDownloadProgress), true)
        ) || [];
        response = new Response(
          trackStream(response.body, DEFAULT_CHUNK_SIZE, onProgress, () => {
            flush && flush();
            unsubscribe && unsubscribe();
          }),
          options
        );
      }
      responseType = responseType || "text";
      let responseData = await resolvers[utils_default.findKey(resolvers, responseType) || "text"](
        response,
        config
      );
      !isStreamResponse && unsubscribe && unsubscribe();
      return await new Promise((resolve, reject) => {
        settle(resolve, reject, {
          data: responseData,
          headers: AxiosHeaders_default.from(response.headers),
          status: response.status,
          statusText: response.statusText,
          config,
          request
        });
      });
    } catch (err) {
      unsubscribe && unsubscribe();
      if (err && err.name === "TypeError" && /Load failed|fetch/i.test(err.message)) {
        throw Object.assign(
          new AxiosError_default(
            "Network Error",
            AxiosError_default.ERR_NETWORK,
            config,
            request,
            err && err.response
          ),
          {
            cause: err.cause || err
          }
        );
      }
      throw AxiosError_default.from(err, err && err.code, config, request, err && err.response);
    }
  };
};
var seedCache = /* @__PURE__ */ new Map();
var getFetch = (config) => {
  let env = config && config.env || {};
  const { fetch: fetch2, Request, Response } = env;
  const seeds = [Request, Response, fetch2];
  let len = seeds.length, i3 = len, seed, target, map = seedCache;
  while (i3--) {
    seed = seeds[i3];
    target = map.get(seed);
    target === void 0 && map.set(seed, target = i3 ? /* @__PURE__ */ new Map() : factory(env));
    map = target;
  }
  return target;
};
var adapter = getFetch();

// node_modules/axios/lib/adapters/adapters.js
var knownAdapters = {
  http: null_default,
  xhr: xhr_default,
  fetch: {
    get: getFetch
  }
};
utils_default.forEach(knownAdapters, (fn, value) => {
  if (fn) {
    try {
      Object.defineProperty(fn, "name", { value });
    } catch (e3) {
    }
    Object.defineProperty(fn, "adapterName", { value });
  }
});
var renderReason = (reason) => `- ${reason}`;
var isResolvedHandle = (adapter2) => utils_default.isFunction(adapter2) || adapter2 === null || adapter2 === false;
function getAdapter(adapters, config) {
  adapters = utils_default.isArray(adapters) ? adapters : [adapters];
  const { length } = adapters;
  let nameOrAdapter;
  let adapter2;
  const rejectedReasons = {};
  for (let i3 = 0; i3 < length; i3++) {
    nameOrAdapter = adapters[i3];
    let id;
    adapter2 = nameOrAdapter;
    if (!isResolvedHandle(nameOrAdapter)) {
      adapter2 = knownAdapters[(id = String(nameOrAdapter)).toLowerCase()];
      if (adapter2 === void 0) {
        throw new AxiosError_default(`Unknown adapter '${id}'`);
      }
    }
    if (adapter2 && (utils_default.isFunction(adapter2) || (adapter2 = adapter2.get(config)))) {
      break;
    }
    rejectedReasons[id || "#" + i3] = adapter2;
  }
  if (!adapter2) {
    const reasons = Object.entries(rejectedReasons).map(
      ([id, state]) => `adapter ${id} ` + (state === false ? "is not supported by the environment" : "is not available in the build")
    );
    let s3 = length ? reasons.length > 1 ? "since :\n" + reasons.map(renderReason).join("\n") : " " + renderReason(reasons[0]) : "as no adapter specified";
    throw new AxiosError_default(
      `There is no suitable adapter to dispatch the request ` + s3,
      "ERR_NOT_SUPPORT"
    );
  }
  return adapter2;
}
var adapters_default = {
  /**
   * Resolve an adapter from a list of adapter names or functions.
   * @type {Function}
   */
  getAdapter,
  /**
   * Exposes all known adapters
   * @type {Object<string, Function|Object>}
   */
  adapters: knownAdapters
};

// node_modules/axios/lib/core/dispatchRequest.js
function throwIfCancellationRequested(config) {
  if (config.cancelToken) {
    config.cancelToken.throwIfRequested();
  }
  if (config.signal && config.signal.aborted) {
    throw new CanceledError_default(null, config);
  }
}
function dispatchRequest(config) {
  throwIfCancellationRequested(config);
  config.headers = AxiosHeaders_default.from(config.headers);
  config.data = transformData.call(config, config.transformRequest);
  if (["post", "put", "patch"].indexOf(config.method) !== -1) {
    config.headers.setContentType("application/x-www-form-urlencoded", false);
  }
  const adapter2 = adapters_default.getAdapter(config.adapter || defaults_default.adapter, config);
  return adapter2(config).then(
    function onAdapterResolution(response) {
      throwIfCancellationRequested(config);
      response.data = transformData.call(config, config.transformResponse, response);
      response.headers = AxiosHeaders_default.from(response.headers);
      return response;
    },
    function onAdapterRejection(reason) {
      if (!isCancel(reason)) {
        throwIfCancellationRequested(config);
        if (reason && reason.response) {
          reason.response.data = transformData.call(
            config,
            config.transformResponse,
            reason.response
          );
          reason.response.headers = AxiosHeaders_default.from(reason.response.headers);
        }
      }
      return Promise.reject(reason);
    }
  );
}

// node_modules/axios/lib/env/data.js
var VERSION = "1.15.2";

// node_modules/axios/lib/helpers/validator.js
var validators = {};
["object", "boolean", "number", "function", "string", "symbol"].forEach((type, i3) => {
  validators[type] = function validator(thing) {
    return typeof thing === type || "a" + (i3 < 1 ? "n " : " ") + type;
  };
});
var deprecatedWarnings = {};
validators.transitional = function transitional(validator, version, message) {
  function formatMessage(opt, desc) {
    return "[Axios v" + VERSION + "] Transitional option '" + opt + "'" + desc + (message ? ". " + message : "");
  }
  return (value, opt, opts) => {
    if (validator === false) {
      throw new AxiosError_default(
        formatMessage(opt, " has been removed" + (version ? " in " + version : "")),
        AxiosError_default.ERR_DEPRECATED
      );
    }
    if (version && !deprecatedWarnings[opt]) {
      deprecatedWarnings[opt] = true;
      console.warn(
        formatMessage(
          opt,
          " has been deprecated since v" + version + " and will be removed in the near future"
        )
      );
    }
    return validator ? validator(value, opt, opts) : true;
  };
};
validators.spelling = function spelling(correctSpelling) {
  return (value, opt) => {
    console.warn(`${opt} is likely a misspelling of ${correctSpelling}`);
    return true;
  };
};
function assertOptions(options, schema, allowUnknown) {
  if (typeof options !== "object") {
    throw new AxiosError_default("options must be an object", AxiosError_default.ERR_BAD_OPTION_VALUE);
  }
  const keys = Object.keys(options);
  let i3 = keys.length;
  while (i3-- > 0) {
    const opt = keys[i3];
    const validator = Object.prototype.hasOwnProperty.call(schema, opt) ? schema[opt] : void 0;
    if (validator) {
      const value = options[opt];
      const result = value === void 0 || validator(value, opt, options);
      if (result !== true) {
        throw new AxiosError_default(
          "option " + opt + " must be " + result,
          AxiosError_default.ERR_BAD_OPTION_VALUE
        );
      }
      continue;
    }
    if (allowUnknown !== true) {
      throw new AxiosError_default("Unknown option " + opt, AxiosError_default.ERR_BAD_OPTION);
    }
  }
}
var validator_default = {
  assertOptions,
  validators
};

// node_modules/axios/lib/core/Axios.js
var validators2 = validator_default.validators;
var Axios = class {
  constructor(instanceConfig) {
    this.defaults = instanceConfig || {};
    this.interceptors = {
      request: new InterceptorManager_default(),
      response: new InterceptorManager_default()
    };
  }
  /**
   * Dispatch a request
   *
   * @param {String|Object} configOrUrl The config specific for this request (merged with this.defaults)
   * @param {?Object} config
   *
   * @returns {Promise} The Promise to be fulfilled
   */
  async request(configOrUrl, config) {
    try {
      return await this._request(configOrUrl, config);
    } catch (err) {
      if (err instanceof Error) {
        let dummy = {};
        Error.captureStackTrace ? Error.captureStackTrace(dummy) : dummy = new Error();
        const stack = (() => {
          if (!dummy.stack) {
            return "";
          }
          const firstNewlineIndex = dummy.stack.indexOf("\n");
          return firstNewlineIndex === -1 ? "" : dummy.stack.slice(firstNewlineIndex + 1);
        })();
        try {
          if (!err.stack) {
            err.stack = stack;
          } else if (stack) {
            const firstNewlineIndex = stack.indexOf("\n");
            const secondNewlineIndex = firstNewlineIndex === -1 ? -1 : stack.indexOf("\n", firstNewlineIndex + 1);
            const stackWithoutTwoTopLines = secondNewlineIndex === -1 ? "" : stack.slice(secondNewlineIndex + 1);
            if (!String(err.stack).endsWith(stackWithoutTwoTopLines)) {
              err.stack += "\n" + stack;
            }
          }
        } catch (e3) {
        }
      }
      throw err;
    }
  }
  _request(configOrUrl, config) {
    if (typeof configOrUrl === "string") {
      config = config || {};
      config.url = configOrUrl;
    } else {
      config = configOrUrl || {};
    }
    config = mergeConfig(this.defaults, config);
    const { transitional: transitional2, paramsSerializer, headers } = config;
    if (transitional2 !== void 0) {
      validator_default.assertOptions(
        transitional2,
        {
          silentJSONParsing: validators2.transitional(validators2.boolean),
          forcedJSONParsing: validators2.transitional(validators2.boolean),
          clarifyTimeoutError: validators2.transitional(validators2.boolean),
          legacyInterceptorReqResOrdering: validators2.transitional(validators2.boolean)
        },
        false
      );
    }
    if (paramsSerializer != null) {
      if (utils_default.isFunction(paramsSerializer)) {
        config.paramsSerializer = {
          serialize: paramsSerializer
        };
      } else {
        validator_default.assertOptions(
          paramsSerializer,
          {
            encode: validators2.function,
            serialize: validators2.function
          },
          true
        );
      }
    }
    if (config.allowAbsoluteUrls !== void 0) {
    } else if (this.defaults.allowAbsoluteUrls !== void 0) {
      config.allowAbsoluteUrls = this.defaults.allowAbsoluteUrls;
    } else {
      config.allowAbsoluteUrls = true;
    }
    validator_default.assertOptions(
      config,
      {
        baseUrl: validators2.spelling("baseURL"),
        withXsrfToken: validators2.spelling("withXSRFToken")
      },
      true
    );
    config.method = (config.method || this.defaults.method || "get").toLowerCase();
    let contextHeaders = headers && utils_default.merge(headers.common, headers[config.method]);
    headers && utils_default.forEach(["delete", "get", "head", "post", "put", "patch", "common"], (method) => {
      delete headers[method];
    });
    config.headers = AxiosHeaders_default.concat(contextHeaders, headers);
    const requestInterceptorChain = [];
    let synchronousRequestInterceptors = true;
    this.interceptors.request.forEach(function unshiftRequestInterceptors(interceptor) {
      if (typeof interceptor.runWhen === "function" && interceptor.runWhen(config) === false) {
        return;
      }
      synchronousRequestInterceptors = synchronousRequestInterceptors && interceptor.synchronous;
      const transitional3 = config.transitional || transitional_default;
      const legacyInterceptorReqResOrdering = transitional3 && transitional3.legacyInterceptorReqResOrdering;
      if (legacyInterceptorReqResOrdering) {
        requestInterceptorChain.unshift(interceptor.fulfilled, interceptor.rejected);
      } else {
        requestInterceptorChain.push(interceptor.fulfilled, interceptor.rejected);
      }
    });
    const responseInterceptorChain = [];
    this.interceptors.response.forEach(function pushResponseInterceptors(interceptor) {
      responseInterceptorChain.push(interceptor.fulfilled, interceptor.rejected);
    });
    let promise;
    let i3 = 0;
    let len;
    if (!synchronousRequestInterceptors) {
      const chain = [dispatchRequest.bind(this), void 0];
      chain.unshift(...requestInterceptorChain);
      chain.push(...responseInterceptorChain);
      len = chain.length;
      promise = Promise.resolve(config);
      while (i3 < len) {
        promise = promise.then(chain[i3++], chain[i3++]);
      }
      return promise;
    }
    len = requestInterceptorChain.length;
    let newConfig = config;
    while (i3 < len) {
      const onFulfilled = requestInterceptorChain[i3++];
      const onRejected = requestInterceptorChain[i3++];
      try {
        newConfig = onFulfilled(newConfig);
      } catch (error) {
        onRejected.call(this, error);
        break;
      }
    }
    try {
      promise = dispatchRequest.call(this, newConfig);
    } catch (error) {
      return Promise.reject(error);
    }
    i3 = 0;
    len = responseInterceptorChain.length;
    while (i3 < len) {
      promise = promise.then(responseInterceptorChain[i3++], responseInterceptorChain[i3++]);
    }
    return promise;
  }
  getUri(config) {
    config = mergeConfig(this.defaults, config);
    const fullPath = buildFullPath(config.baseURL, config.url, config.allowAbsoluteUrls);
    return buildURL(fullPath, config.params, config.paramsSerializer);
  }
};
utils_default.forEach(["delete", "get", "head", "options"], function forEachMethodNoData(method) {
  Axios.prototype[method] = function(url, config) {
    return this.request(
      mergeConfig(config || {}, {
        method,
        url,
        data: (config || {}).data
      })
    );
  };
});
utils_default.forEach(["post", "put", "patch"], function forEachMethodWithData(method) {
  function generateHTTPMethod(isForm) {
    return function httpMethod(url, data, config) {
      return this.request(
        mergeConfig(config || {}, {
          method,
          headers: isForm ? {
            "Content-Type": "multipart/form-data"
          } : {},
          url,
          data
        })
      );
    };
  }
  Axios.prototype[method] = generateHTTPMethod();
  Axios.prototype[method + "Form"] = generateHTTPMethod(true);
});
var Axios_default = Axios;

// node_modules/axios/lib/cancel/CancelToken.js
var CancelToken = class _CancelToken {
  constructor(executor) {
    if (typeof executor !== "function") {
      throw new TypeError("executor must be a function.");
    }
    let resolvePromise;
    this.promise = new Promise(function promiseExecutor(resolve) {
      resolvePromise = resolve;
    });
    const token = this;
    this.promise.then((cancel) => {
      if (!token._listeners) return;
      let i3 = token._listeners.length;
      while (i3-- > 0) {
        token._listeners[i3](cancel);
      }
      token._listeners = null;
    });
    this.promise.then = (onfulfilled) => {
      let _resolve;
      const promise = new Promise((resolve) => {
        token.subscribe(resolve);
        _resolve = resolve;
      }).then(onfulfilled);
      promise.cancel = function reject() {
        token.unsubscribe(_resolve);
      };
      return promise;
    };
    executor(function cancel(message, config, request) {
      if (token.reason) {
        return;
      }
      token.reason = new CanceledError_default(message, config, request);
      resolvePromise(token.reason);
    });
  }
  /**
   * Throws a `CanceledError` if cancellation has been requested.
   */
  throwIfRequested() {
    if (this.reason) {
      throw this.reason;
    }
  }
  /**
   * Subscribe to the cancel signal
   */
  subscribe(listener) {
    if (this.reason) {
      listener(this.reason);
      return;
    }
    if (this._listeners) {
      this._listeners.push(listener);
    } else {
      this._listeners = [listener];
    }
  }
  /**
   * Unsubscribe from the cancel signal
   */
  unsubscribe(listener) {
    if (!this._listeners) {
      return;
    }
    const index = this._listeners.indexOf(listener);
    if (index !== -1) {
      this._listeners.splice(index, 1);
    }
  }
  toAbortSignal() {
    const controller = new AbortController();
    const abort = (err) => {
      controller.abort(err);
    };
    this.subscribe(abort);
    controller.signal.unsubscribe = () => this.unsubscribe(abort);
    return controller.signal;
  }
  /**
   * Returns an object that contains a new `CancelToken` and a function that, when called,
   * cancels the `CancelToken`.
   */
  static source() {
    let cancel;
    const token = new _CancelToken(function executor(c3) {
      cancel = c3;
    });
    return {
      token,
      cancel
    };
  }
};
var CancelToken_default = CancelToken;

// node_modules/axios/lib/helpers/spread.js
function spread(callback) {
  return function wrap(arr) {
    return callback.apply(null, arr);
  };
}

// node_modules/axios/lib/helpers/isAxiosError.js
function isAxiosError(payload) {
  return utils_default.isObject(payload) && payload.isAxiosError === true;
}

// node_modules/axios/lib/helpers/HttpStatusCode.js
var HttpStatusCode = {
  Continue: 100,
  SwitchingProtocols: 101,
  Processing: 102,
  EarlyHints: 103,
  Ok: 200,
  Created: 201,
  Accepted: 202,
  NonAuthoritativeInformation: 203,
  NoContent: 204,
  ResetContent: 205,
  PartialContent: 206,
  MultiStatus: 207,
  AlreadyReported: 208,
  ImUsed: 226,
  MultipleChoices: 300,
  MovedPermanently: 301,
  Found: 302,
  SeeOther: 303,
  NotModified: 304,
  UseProxy: 305,
  Unused: 306,
  TemporaryRedirect: 307,
  PermanentRedirect: 308,
  BadRequest: 400,
  Unauthorized: 401,
  PaymentRequired: 402,
  Forbidden: 403,
  NotFound: 404,
  MethodNotAllowed: 405,
  NotAcceptable: 406,
  ProxyAuthenticationRequired: 407,
  RequestTimeout: 408,
  Conflict: 409,
  Gone: 410,
  LengthRequired: 411,
  PreconditionFailed: 412,
  PayloadTooLarge: 413,
  UriTooLong: 414,
  UnsupportedMediaType: 415,
  RangeNotSatisfiable: 416,
  ExpectationFailed: 417,
  ImATeapot: 418,
  MisdirectedRequest: 421,
  UnprocessableEntity: 422,
  Locked: 423,
  FailedDependency: 424,
  TooEarly: 425,
  UpgradeRequired: 426,
  PreconditionRequired: 428,
  TooManyRequests: 429,
  RequestHeaderFieldsTooLarge: 431,
  UnavailableForLegalReasons: 451,
  InternalServerError: 500,
  NotImplemented: 501,
  BadGateway: 502,
  ServiceUnavailable: 503,
  GatewayTimeout: 504,
  HttpVersionNotSupported: 505,
  VariantAlsoNegotiates: 506,
  InsufficientStorage: 507,
  LoopDetected: 508,
  NotExtended: 510,
  NetworkAuthenticationRequired: 511,
  WebServerIsDown: 521,
  ConnectionTimedOut: 522,
  OriginIsUnreachable: 523,
  TimeoutOccurred: 524,
  SslHandshakeFailed: 525,
  InvalidSslCertificate: 526
};
Object.entries(HttpStatusCode).forEach(([key, value]) => {
  HttpStatusCode[value] = key;
});
var HttpStatusCode_default = HttpStatusCode;

// node_modules/axios/lib/axios.js
function createInstance(defaultConfig) {
  const context = new Axios_default(defaultConfig);
  const instance = bind(Axios_default.prototype.request, context);
  utils_default.extend(instance, Axios_default.prototype, context, { allOwnKeys: true });
  utils_default.extend(instance, context, null, { allOwnKeys: true });
  instance.create = function create(instanceConfig) {
    return createInstance(mergeConfig(defaultConfig, instanceConfig));
  };
  return instance;
}
var axios = createInstance(defaults_default);
axios.Axios = Axios_default;
axios.CanceledError = CanceledError_default;
axios.CancelToken = CancelToken_default;
axios.isCancel = isCancel;
axios.VERSION = VERSION;
axios.toFormData = toFormData_default;
axios.AxiosError = AxiosError_default;
axios.Cancel = axios.CanceledError;
axios.all = function all(promises) {
  return Promise.all(promises);
};
axios.spread = spread;
axios.isAxiosError = isAxiosError;
axios.mergeConfig = mergeConfig;
axios.AxiosHeaders = AxiosHeaders_default;
axios.formToJSON = (thing) => formDataToJSON_default(utils_default.isHTMLForm(thing) ? new FormData(thing) : thing);
axios.getAdapter = adapters_default.getAdapter;
axios.HttpStatusCode = HttpStatusCode_default;
axios.default = axios;
var axios_default = axios;

// node_modules/axios/index.js
var {
  Axios: Axios2,
  AxiosError: AxiosError2,
  CanceledError: CanceledError2,
  isCancel: isCancel2,
  CancelToken: CancelToken2,
  VERSION: VERSION2,
  all: all2,
  Cancel,
  isAxiosError: isAxiosError2,
  spread: spread2,
  toFormData: toFormData2,
  AxiosHeaders: AxiosHeaders2,
  HttpStatusCode: HttpStatusCode2,
  formToJSON,
  getAdapter: getAdapter2,
  mergeConfig: mergeConfig2
} = axios_default;

// src/lib/RestfulModelStore.ts
var import_fbemitter = __toESM(require_fbemitter(), 1);

// src/lib/RateLimiter.ts
var Collections = __toESM(require_lib(), 1);
var RateLimiter = class {
  /*
   * @param initialRps The starting Requests-per-second to execute
   * @param successIncrement The amount to increment the RPS when a request succeeds
   * @param failureFraction The fraction to backoff on failure, default is 0.8 which means 80% of the current RPS
   * @param minRps Minimum allowable RPS, default is 0.2, meaning one request per 5 seconds
   * 
   * This class is designed to implement additive increase/multiplicative decrease in request rate to ensure fair sharing if server resources are contended. 
   * 
   * NOTE: Because the successIncrement is adjusted on a per-request basis, the increase is quadratic, not linear as intended.
   *
   * TODO: Make the increase linear, not quadratic
   * 
   */
  constructor({ initialRps = 1, successIncrement = 0.1, failureFraction = 0.8, minRps = 0.2 }) {
    this.fails = 0;
    this.successes = 0;
    this.queues = 0;
    this.q = new Collections.Queue();
    this.lastExecuteTime = 0;
    this.initialRps = initialRps;
    this.successIncrement = successIncrement;
    this.failureFraction = failureFraction;
    this.minRps = minRps;
    this.currentRps = this.initialRps;
  }
  /*
   * Takes a block, queues it for execution. Depending on success/failure of the resulting Promise, the 
   * execution rate is adjusted.  
   */
  execute(block) {
    const now = Date.now();
    const q4 = this.q;
    const q_is_empty = q4.isEmpty();
    if (q_is_empty && this.currentRps * (now - this.lastExecuteTime) / 1e3 >= 1) {
      this.lastExecuteTime = now;
      const p3 = block();
      p3.then(() => this.successes++).catch(() => {
        this.fails++;
        this.blockFailed();
      });
      return p3;
    } else {
      if (q_is_empty) this.queueNextExecute(now);
      this.queues++;
      return new Promise((resolve, reject) => {
        q4.add(() => {
          const p3 = block();
          p3.then((r3) => resolve(r3)).catch((e3) => reject(e3));
          return p3;
        });
      });
    }
  }
  executeBlocks() {
    const now = Date.now();
    const q4 = this.q;
    let blocksToExecute = this.currentRps * (now - this.lastExecuteTime) / 1e3;
    for (; blocksToExecute >= 1 && !q4.isEmpty(); blocksToExecute--) {
      const promise = q4.dequeue()();
      promise.then(() => this.blockSucceeded()).catch(() => this.blockFailed());
    }
    this.lastExecuteTime = now - 1e3 * (blocksToExecute / this.currentRps);
    if (!this.q.isEmpty()) this.queueNextExecute(now);
  }
  queueNextExecute(now) {
    const timeToNextExecute = this.lastExecuteTime + 1e3 / this.currentRps - now;
    setTimeout(() => this.executeBlocks(), Math.max(timeToNextExecute, 0));
  }
  blockSucceeded() {
    this.currentRps += this.successIncrement;
    this.successes++;
  }
  blockFailed() {
    this.currentRps = Math.max(this.currentRps * this.failureFraction, this.minRps);
    this.fails++;
  }
};

// src/lib/RestfulModelStore.ts
var Collections2 = __toESM(require_lib(), 1);
var BaseModel = class {
  constructor(store, definition) {
    this.store = store;
    this.name = definition.name;
    this.inflections = definition.inflections;
    this.instances = /* @__PURE__ */ new Map();
    this.queries = /* @__PURE__ */ new Map();
    this.query_epoch = 0;
    this.server_side_new = !!definition.server_side_new;
  }
};
var Model = class extends BaseModel {
  constructor() {
    super(...arguments);
    this.singleton = false;
  }
  fetch(id, force = false) {
    return this.store.fetch(this, id, force);
  }
  fetchMany(ids, force = false) {
    return this.store.fetchMulti(this, ids, force);
  }
  queryFor(name, arg) {
    return this.store.queryFor(this, name, arg);
  }
  destroy(id) {
    return this.store.destroy(this, id);
  }
  create(record) {
    return this.store.create(this, record);
  }
  patch(id, changes) {
    return this.store.patch(this, id, changes);
  }
  new(fields) {
    return this.store.new(this, fields);
  }
};
var SingletonModel = class extends BaseModel {
  constructor() {
    super(...arguments);
    this.singleton = true;
  }
  fetch(force = false) {
    return this.store.fetch(this, this.name, force);
  }
  destroy() {
    return this.store.destroy(this, this.name);
  }
  create(record) {
    return this.store.create(this, record);
  }
  patch(changes) {
    return this.store.patch(this, this.name, changes);
  }
};
var RestfulModelStore = class extends import_fbemitter.EventEmitter {
  constructor(axios2) {
    super();
    this.is_dirty = false;
    this.io_queue = new Collections2.PriorityQueue((a3, b2) => a3.run_time - b2.run_time);
    this.io_rate_limiter = new RateLimiter({ initialRps: 10 });
    this.axios = axios2;
    this.models = {};
    this.txns = /* @__PURE__ */ new WeakMap();
    this.news = /* @__PURE__ */ new WeakMap();
    this.seq = 0;
  }
  /*
   * Used to track the current state of the data store
   */
  getSequence() {
    return this.seq;
  }
  /*
   * Returns a Model object for the given ModelDefinition. Use:
   *
   * ```
   * import {MyModel} from 'my_model_definitions';
   * 
   * let my_record = data_store.m(MyModel).fetch(id);
   * ```
   * 
   */
  m(definition) {
    const models = this.models;
    return models[definition.name] || (models[definition.name] = new Model(this, definition));
  }
  /*
   * Returns a SingletonModel object for the given ModelDefinition
   */
  s(definition) {
    const models = this.models;
    return models[definition.name] || (models[definition.name] = new SingletonModel(this, definition));
  }
  fetchMulti(model, ids, force = false) {
    const records = ids.map((id) => this.fetch(model, id, force));
    const results = Object.assign(
      records,
      {
        _loading: records.some((r3) => r3._loading),
        _found: records.some((r3) => r3._found),
        _loaded: records.every((r3) => r3._loaded)
      }
    );
    return results;
  }
  // Returns a model for the given id
  fetch(model, id, force = false) {
    if ((typeof id === "undefined" || id == null) && !model.singleton) {
      throw new Error("Whoops!");
    }
    let exists = true;
    const record = this.fetchNewRecord(model, id) || model.instances.get(id) || {
      _loading: true,
      _loaded: exists = false,
      _found: false,
      _seq: this.seq++,
      id
    };
    if (!exists || record && record._loaded && force) {
      model.instances.set(id, record);
      this.soil();
      this.io_queue.enqueue({
        io_type: "fetch",
        model,
        run_time: 0,
        //The distant past, so means "right now"
        record
      });
      this.schedule_queue_processing();
    }
    this.emit("loadSequence", record._seq);
    return record;
  }
  /*
   * Returns a txn object the represents the outstanding transaction
   * The txn object will be populated with an 'id' property once the transaction
   * compeltes
   *
   * Error handling: TBD
   */
  create(model, record) {
    const { id, ...record_params } = record;
    const new_record = { ...record_params, ...{
      _loading: true,
      _loaded: false,
      _found: true,
      _seq: this.seq++
    } };
    const txn = { record: new_record, seq: new_record._seq };
    const url = "/" + encodeURIComponent(model.singleton ? model.name : model.inflections.plural) + ".json";
    const request = this.axios.post(
      url,
      { [model.name]: record_params },
      {}
    );
    request.then((response) => {
      this.update_store(response);
      this.txns.set(txn, {
        id: response.data.id,
        status: "succeeded",
        seq: this.seq++
      });
      if (id) {
        this.news.set(id, response.data.id);
      }
      model.query_epoch++;
      this.soil();
    }).catch((error) => {
      const response = error.response;
      this.txns.set(txn, {
        id: null,
        status: "error",
        errors: response.data.errors,
        seq: this.seq++
      });
      this.soil();
    });
    return txn;
  }
  /*
   * Creates a new, blank record that can later be "patched" but will actually do a "create"
   */
  new(model, initial_fields) {
    const id = {
      seq: this.seq++,
      //To madke it usable as, e.g., a key in a React list
      toString() {
        return "new-" + this.seq;
      }
    };
    const ret = Object.assign({}, initial_fields, {
      _loading: model.server_side_new,
      _loaded: true,
      _found: !model.server_side_new,
      //It's not considered "found" until a round-trip to the server
      _new: true,
      _seq: this.seq,
      //Already incremented above
      id
    });
    this.news.set(id, ret);
    if (model.server_side_new) {
      const query_string = JSON.stringify({ [model.name]: initial_fields });
      const url = "/" + encodeURIComponent(model.singleton ? model.name : model.inflections.plural) + "/new.json?json=" + encodeURIComponent(query_string);
      const request = this.axios.get(
        url,
        {
          headers: {
            "X-CSRF-Token": document.head.querySelector("meta[name=csrf-token]").getAttribute("content")
          }
        }
      );
      request.then((response) => {
        this.update_store(response);
        const new_object = response.data.data;
        this.news.set(id, Object.assign(
          {},
          ret,
          new_object,
          { _loading: false, _found: true, _seq: this.seq++ }
        ));
        this.soil();
      }).catch((_error) => {
        this.soil();
      });
    }
    this.emit("loadSequence", ret._seq);
    return ret;
  }
  /*
   * Given a txn ojbect from create() or patch(), returns information about the transaction if the txn is completed
   * Retuns undefined if the request is still in progress
   *
   * TODO: Handle updates and errors
   */
  txn_status(txn) {
    const txn_result = this.txns.get(txn);
    this.emit("loadSequence", txn_result ? txn_result.seq : txn.seq);
    return txn_result;
  }
  destroy(model, id) {
    const new_record = this.news.get(id);
    if (new_record) {
      this.news.delete(id);
      const txn2 = {
        record: Object.assign({}, new_record, { _destroyed: true })
      };
      this.txns.set(txn2, {
        id,
        status: "succeeded",
        seq: this.seq++
      });
      this.soil();
      return txn2;
    }
    const deleting_record = Object.assign({}, model.instances.get(id) || this.emptyLoadingRecord(id || ""), { _loading: true, _destroyed: true });
    const txn = {
      record: deleting_record
    };
    model.instances.set(id, deleting_record);
    this.soil();
    const url = "/" + encodeURIComponent(model.singleton ? model.name : model.inflections.plural) + (id ? "/" + encodeURIComponent(id.toString()) : "") + ".json";
    const request = this.axios.delete(
      url,
      {
        headers: {
          "X-CSRF-Token": document.head.querySelector("meta[name=csrf-token]").getAttribute("content")
        }
      }
    );
    request.then(() => {
      this.txns.set(txn, {
        status: "succeeded",
        id,
        seq: this.seq++
      });
      model.query_epoch++;
      model.instances.delete(id);
      this.soil();
    }).catch((e3) => console.log("ERROR 2!!", e3));
    request.catch((e3) => console.log("Something bad happened during the destroy", e3));
    return txn;
  }
  /*
   * Patches a set of changes on the object with "id".
   *
   * Returns the fetched version of the object. It will be stale or empty.
   *
   */
  patch(model, id, changes) {
    const new_record = this.news.get(id);
    if (typeof new_record === "object") {
      const initial_values = ObjectFilterBy(new_record, (k3) => k3[0] !== "_");
      return this.create(model, { ...initial_values, ...changes, id });
    }
    const txn = { model: model.name, id, changes, seq: this.seq++ };
    const url = "/" + encodeURIComponent(model.singleton ? model.name : model.inflections.plural) + (id ? "/" + encodeURIComponent(id.toString()) : "");
    const request = this.axios.patch(
      url,
      { [model.name]: changes },
      {
        headers: {
          Accept: "application/json"
        }
      }
    );
    request.then((response) => {
      this.update_store(response);
      this.txns.set(txn, {
        status: "succeeded",
        id,
        seq: this.seq++
      });
      model.query_epoch++;
      this.soil();
    }).catch(() => {
      this.txns.set(txn, {
        status: "error",
        id,
        seq: this.seq++
      });
      this.soil();
    });
    return txn;
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  queryFor(model, name, arg) {
    const canonName = name;
    const canonArg = this.canonicalize_query(arg);
    const querySet = this.queriesForName(model, canonName);
    const epochAtStart = model.query_epoch;
    let unresolvedResult;
    let doLoad = false;
    if (querySet.has(canonArg)) {
      unresolvedResult = querySet.get(canonArg);
      if (unresolvedResult._epoch < model.query_epoch) {
        doLoad = true;
        querySet.set(canonArg, Object.assign([], unresolvedResult, { _epoch: model.queryFor }));
      }
    } else {
      unresolvedResult = Object.assign([], {
        _loading: true,
        _loaded: false,
        _found: false,
        _seq: this.seq++,
        _epoch: epochAtStart,
        _metadata: {}
      });
      doLoad = true;
      querySet.set(canonArg, unresolvedResult);
    }
    const ret = Object.assign(
      unresolvedResult.map((id) => this.fetch(model, id)),
      {
        _loading: unresolvedResult._loading || doLoad,
        _loaded: unresolvedResult._loaded,
        _found: unresolvedResult._found,
        _seq: unresolvedResult._seq,
        metadata: unresolvedResult.metadata
      }
    );
    this.emit("loadSequence", ret._seq);
    if (doLoad) {
      this.io_queue.enqueue({
        io_type: "query",
        run_time: 0,
        model,
        query: {
          name: canonName,
          args: canonArg,
          epoch_at_start: epochAtStart,
          error_count: 0
        }
      });
      this.schedule_queue_processing();
    }
    return ret;
  }
  /*
   * Useful when a dependent record can't be fetched b/c its is sourced from
   * an object still loading.
   *
   */
  emptyLoadingRecord(id) {
    return {
      _loading: true,
      _found: false,
      _loaded: false,
      _seq: this.seq,
      // No need to increment because this is a non-mutating method
      id
    };
  }
  emptyLoadingQuery() {
    const q4 = Object.assign([], {
      _loading: true,
      _loaded: false,
      _found: false
    });
    return q4;
  }
  fetchNewRecord(model, id) {
    const nr = this.news.get(id);
    if (typeof nr == "object") {
      return nr;
    } else if (nr) {
      return this.fetch(model, nr);
    }
  }
  // null is allowed for "name" for queries that don't specify a sub-route, e.g. "/my_models?q={some_query:'foo'}"
  queriesForName(model, name) {
    const q4 = model.queries;
    return q4.get(name) || q4.set(name, /* @__PURE__ */ new Map()).get(name);
  }
  // private getQuery(name, arg) {
  //   arg = JSON.stringify(this.canonicalize_query(arg));
  //   return this.queriesForName(name).get(arg);
  // }
  //converts the arg into a JSON-able object that represents the query params
  canonicalize_query(arg) {
    if (!arg) return null;
    if (typeof arg !== "object" || Array.isArray(arg)) {
      throw new Error("Canonicalizer must be passed an object at the top level");
    }
    return JSON.stringify(this.canonicalize_query_obj(arg));
  }
  // Internal helper that returns an object ready to be serialized
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  canonicalize_query_obj(arg) {
    if (arg === void 0 || arg === null) {
      return null;
    } else if (Array.isArray(arg)) {
      return arg.map((v3) => this.canonicalize_query_obj(v3));
    } else if (typeof arg === "number" || typeof arg === "string" || typeof arg === "boolean") {
      return arg;
    } else if (typeof arg === "object") {
      const ret = {};
      const props = Object.getOwnPropertyNames(arg).sort();
      for (const k3 of props) {
        ret[k3] = this.canonicalize_query_obj(arg[k3]);
      }
      return ret;
    } else {
      throw new Error("Default canonicalizer doesn't know how to serialize a " + typeof arg + ", got " + arg);
    }
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  update_store(response) {
    const update_seq = this.seq++;
    const invalidates = response.data.invalidates;
    if (invalidates) {
      for (const clazz of Object.keys(invalidates)) {
        const model = this.models[clazz];
        if (model) {
          const invalidation = invalidates[clazz];
          if (invalidation === "all" || invalidation === "queries")
            model.query_epoch++;
          if (invalidation === "all" || invalidation === "records")
            model.instances.clear();
        }
      }
    }
    for (const model of Object.values(this.models)) {
      if (model.singleton) {
        if (response.data[model.name]) {
          const item = response.data[model.name];
          item._loading = false;
          item._loaded = true;
          item._found = true;
          item._seq = update_seq;
          model.instances.set(model.name, item);
        }
      } else {
        for (const item of response.data[model.inflections.plural] || []) {
          item._loading = false;
          item._loaded = true;
          item._found = true;
          const orig = model.instances.get(item.id);
          if (!orig || !orig.lock_version || !item.lock_version || orig.lock_version !== item.lock_version)
            item._seq = update_seq;
          else
            item._seq = orig._seq;
          model.instances.set(item.id, item);
        }
      }
    }
    this.soil();
  }
  processQueue() {
    const now = Date.now();
    for (; ; ) {
      const op = this.io_queue.dequeue();
      if (!op) break;
      if (op.run_time > now) {
        this.io_queue.enqueue(op);
        break;
      }
      const model = op.model;
      let url;
      if (op.io_type === "fetch") {
        const id = op.record.id;
        url = "/" + encodeURIComponent(model.singleton ? model.name : model.inflections.plural) + (id ? "/" + encodeURIComponent(id.toString()) : "");
      } else {
        const query = op.query;
        url = "/" + encodeURIComponent(model.inflections.plural) + (query.name ? "/" + encodeURIComponent(query.name) : "") + ".json" + (query.args ? "?q=" + encodeURIComponent(query.args) : "");
      }
      this.io_rate_limiter.execute(() => this.axios.get(url, {
        headers: {
          Accept: "application/json"
        }
      })).then((response) => {
        if (op.io_type === "query") {
          const query = op.query;
          const queryResults = response.data.query;
          queryResults._loading = false;
          queryResults._loaded = true;
          queryResults._found = true;
          queryResults._seq = this.seq++;
          queryResults._epoch = query.epoch_at_start;
          queryResults.metadata = response.data.metadata;
          this.queriesForName(model, query.name).set(query.args, queryResults);
        }
        this.update_store(response);
      }).catch((error) => {
        let retriable_error, terminal_error;
        if (op.io_type === "fetch") {
          const id = op.record.id;
          retriable_error = () => {
            const error_count = (op.record._error || 0) + 1;
            const record = {
              _loading: true,
              _loaded: false,
              _found: false,
              _seq: this.seq++,
              _error: error_count,
              //Increment the error count
              id
            };
            model.instances.set(id, record);
            this.io_queue.enqueue({
              io_type: "fetch",
              model,
              //Retry the first error immediately, otherwise, backoff exponentially, max 30 seconds
              run_time: now + 1e3 * Math.min(Math.max(0, Math.min(error_count, 10) - 1) ** 1.5, 30),
              record
            });
            this.soil();
          };
          terminal_error = () => {
            model.instances.set(id, {
              _loading: false,
              _loaded: true,
              _found: false,
              _seq: this.seq++,
              id
            });
            this.soil();
          };
        } else {
          const query = op.query;
          const error_count = query.error_count + 1;
          terminal_error = () => {
            const queryResults = Object.assign([], {
              _loaded: true,
              _loading: false,
              _found: false,
              _seq: this.seq++,
              _epoch: query.epoch_at_start
            });
            this.queriesForName(model, query.name).set(query.name, queryResults);
          };
          retriable_error = () => {
            const queryResults = Object.assign([], {
              _loaded: true,
              _loading: true,
              _found: false,
              _seq: this.seq++,
              _epoch: query.epoch_at_start,
              _error_count: error_count
            });
            this.queriesForName(model, query.name).set(query.name, queryResults);
            this.soil();
            this.io_queue.enqueue(Object.assign({}, op, {
              run_time: now + 1e3 * Math.min(Math.max(0, Math.min(error_count, 10) - 1) ** 1.5, 30),
              query: Object.assign({}, op.query, {
                error_count,
                //Since we're retrying the query, it is running in the current epoch, there's no chance it's stale
                epoch_at_start: model.query_epoch
              })
            }));
          };
        }
        if (error.response) {
          if (error.response.status === 404) {
            terminal_error();
          } else if (error.response.status === 401) {
            terminal_error();
          } else {
            console.log("Fetch Error at Server", error);
            retriable_error();
          }
        } else {
          console.log("Fetch Error", error);
          retriable_error();
        }
        this.schedule_queue_processing();
      });
    }
    this.schedule_queue_processing();
  }
  schedule_queue_processing() {
    if (this.io_timeout) {
      window.clearTimeout(this.io_timeout);
    }
    const next_op = this.io_queue.peek();
    if (next_op) {
      this.io_timeout = window.setTimeout(() => {
        this.processQueue();
      }, Math.max(0, next_op.run_time - Date.now()));
    }
  }
  //Uses a setTimeout() hack to batch a lot of changes up into one "changed" event
  soil() {
    if (!this.is_dirty) {
      this.is_dirty = true;
      requestAnimationFrame(() => {
        this.is_dirty = false;
        this.emit("change");
      });
    }
  }
};
function ObjectFilterBy(obj, predicate) {
  return Object.keys(obj).filter((key) => predicate(key)).reduce((out, key) => {
    out[key] = obj[key];
    return out;
  }, {});
}

// src/store.ts
var API_BASE = globalThis.PLC_API_BASE ?? "http://localhost:3000";
var AxiosClient = axios_default.create({
  baseURL: API_BASE,
  headers: { Accept: "application/json" }
});
var Store = new RestfulModelStore(AxiosClient);
var Device = {
  name: "device",
  inflections: { plural: "devices", title: "Device" },
  singleton: false
};
var HostInterface = {
  name: "host_interface",
  inflections: { plural: "host_interfaces", title: "HostInterface" },
  singleton: false
};
var Measurement = {
  name: "measurement",
  inflections: { plural: "measurements", title: "Measurement" },
  singleton: false
};
var MeasurementDatum = {
  name: "measurement_datum",
  inflections: { plural: "measurement_data", title: "MeasurementDatum" },
  singleton: false
};

// node_modules/preact/jsx-runtime/dist/jsxRuntime.module.js
var f3 = 0;
function u3(e3, t3, n2, o3, i3, u4) {
  t3 || (t3 = {});
  var a3, c3, p3 = t3;
  if ("ref" in p3) for (c3 in p3 = {}, t3) "ref" == c3 ? a3 = t3[c3] : p3[c3] = t3[c3];
  var l3 = { type: e3, props: p3, key: n2, ref: a3, __k: null, __: null, __b: 0, __e: null, __c: null, constructor: void 0, __v: --f3, __i: -1, __u: 0, __source: i3, __self: u4 };
  if ("function" == typeof e3 && (a3 = e3.defaultProps)) for (c3 in a3) void 0 === p3[c3] && (p3[c3] = a3[c3]);
  return l.vnode && l.vnode(l3), l3;
}

// src/App.tsx
function App() {
  const [showForm, setShowForm] = d2(null);
  const { devices, interfaces, measurements } = useLoaders(() => {
    const devices2 = Store.m(Device).queryFor(null, {});
    const interfaces2 = Store.m(HostInterface).queryFor(null, {});
    const measurements2 = Store.m(Measurement).queryFor(null, {});
    return { devices: devices2, interfaces: interfaces2, measurements: measurements2 };
  }, [Store]);
  return /* @__PURE__ */ u3("div", { class: "min-h-screen bg-surface", children: [
    /* @__PURE__ */ u3("header", { class: "border-b border-border px-6 py-4", children: [
      /* @__PURE__ */ u3("h1", { class: "text-2xl font-bold tracking-tight", children: "PLC Controller" }),
      /* @__PURE__ */ u3("p", { class: "text-sm text-text-muted", children: "HVAC Monitoring Dashboard" })
    ] }),
    /* @__PURE__ */ u3("main", { class: "p-6 space-y-8", children: [
      /* @__PURE__ */ u3("section", { children: [
        /* @__PURE__ */ u3("h2", { class: "text-lg font-semibold mb-4", children: "Devices" }),
        !devices._loaded ? /* @__PURE__ */ u3("p", { class: "text-text-muted", children: "Loading devices..." }) : /* @__PURE__ */ u3("div", { class: "grid gap-4 md:grid-cols-3", children: devices.map((device) => /* @__PURE__ */ u3(DeviceCard, { device, interfaces }, device.id)) })
      ] }),
      /* @__PURE__ */ u3("section", { children: [
        /* @__PURE__ */ u3("div", { class: "flex items-center justify-between mb-4", children: [
          /* @__PURE__ */ u3("h2", { class: "text-lg font-semibold", children: "Measurements" }),
          /* @__PURE__ */ u3(
            "button",
            {
              class: "rounded bg-active px-3 py-1.5 text-sm font-medium text-white hover:opacity-90",
              onClick: () => setShowForm("new"),
              children: "+ New Measurement"
            }
          )
        ] }),
        showForm !== null && /* @__PURE__ */ u3(
          MeasurementForm,
          {
            editId: showForm === "new" ? null : showForm,
            devices,
            onClose: () => setShowForm(null)
          }
        ),
        !measurements._loaded ? /* @__PURE__ */ u3("p", { class: "text-text-muted", children: "Loading measurements..." }) : measurements.length === 0 ? /* @__PURE__ */ u3("p", { class: "text-text-muted", children: "No measurements configured yet." }) : /* @__PURE__ */ u3("div", { class: "grid gap-4 md:grid-cols-3", children: measurements.map((m3) => /* @__PURE__ */ u3(
          MeasurementCard,
          {
            measurement: m3,
            devices,
            onEdit: (id) => setShowForm(id)
          },
          m3.id
        )) })
      ] })
    ] })
  ] });
}
function MeasurementCard({ measurement, devices, onEdit }) {
  if (!measurement._found) return null;
  const m3 = measurement;
  const { latest } = useLoaders(() => {
    const data = Store.m(MeasurementDatum).queryFor(null, { measurement_id: m3.id, limit: 1 });
    const latest2 = data._found && data.length > 0 ? data[0] : null;
    return { latest: latest2 };
  }, [Store]);
  const device = devices.find((d3) => d3._found && d3.id === m3.device_id);
  const deviceName = device?._found ? device.name : null;
  const latestDatum = latest?._found ? latest : null;
  return /* @__PURE__ */ u3("div", { class: "rounded-lg border border-border bg-surface p-4 space-y-2", children: [
    /* @__PURE__ */ u3("div", { class: "flex items-center justify-between", children: [
      /* @__PURE__ */ u3("h3", { class: "text-sm font-semibold", children: m3.name }),
      /* @__PURE__ */ u3(
        "button",
        {
          class: "text-xs text-text-muted hover:text-text",
          onClick: () => onEdit(m3.id),
          children: "Edit"
        }
      )
    ] }),
    /* @__PURE__ */ u3("div", { class: "text-2xl font-mono font-bold", children: latestDatum ? latestDatum.value !== null ? /* @__PURE__ */ u3(S, { children: [
      latestDatum.value.toFixed(1),
      m3.units && /* @__PURE__ */ u3("span", { class: "text-sm text-text-muted ml-1", children: m3.units })
    ] }) : /* @__PURE__ */ u3("span", { class: "text-text-muted", children: "\u2014" }) : /* @__PURE__ */ u3("span", { class: "text-text-muted text-sm", children: "No data" }) }),
    /* @__PURE__ */ u3("div", { class: "text-xs text-text-muted space-y-0.5", children: [
      deviceName && /* @__PURE__ */ u3("p", { children: [
        "Source: ",
        deviceName
      ] }),
      m3.source_path && /* @__PURE__ */ u3("p", { children: [
        "Path: ",
        m3.source_path
      ] }),
      /* @__PURE__ */ u3("p", { children: [
        "Every ",
        m3.update_period,
        "s"
      ] }),
      latestDatum?.recorded_at && /* @__PURE__ */ u3("p", { children: new Date(latestDatum.recorded_at).toLocaleTimeString() })
    ] })
  ] });
}
function MeasurementForm({ editId, devices, onClose }) {
  const existing = editId !== null ? Store.m(Measurement).fetch(editId) : null;
  const found = existing?._found ? existing : null;
  const [name, setName] = d2(found?.name ?? "");
  const [deviceId, setDeviceId] = d2(String(found?.device_id ?? ""));
  const [sourcePath, setSourcePath] = d2(found?.source_path ?? "");
  const [updatePeriod, setUpdatePeriod] = d2(String(found?.update_period ?? 60));
  const [units, setUnits] = d2(found?.units ?? "");
  const [saving, setSaving] = d2(false);
  const handleSave = () => {
    const fields = {
      name,
      source_type: "device",
      device_id: parseInt(deviceId, 10),
      source_path: sourcePath || null,
      update_period: parseInt(updatePeriod, 10),
      units: units || null
    };
    setSaving(true);
    let txn;
    if (editId !== null) {
      txn = Store.m(Measurement).patch(editId, fields);
    } else {
      txn = Store.m(Measurement).create(fields);
    }
    const check = () => {
      const result = Store.txn_status(txn);
      if (result) {
        setSaving(false);
        if (result.status === "succeeded") onClose();
      } else {
        setTimeout(check, 100);
      }
    };
    check();
  };
  const handleDelete = () => {
    if (editId === null) return;
    Store.m(Measurement).destroy(editId);
    onClose();
  };
  const foundDevices = devices.filter((d3) => d3._found);
  return /* @__PURE__ */ u3("div", { class: "rounded-lg border border-border bg-surface-alt p-4 mb-4 space-y-3", children: [
    /* @__PURE__ */ u3("h3", { class: "text-sm font-semibold", children: [
      editId !== null ? "Edit" : "New",
      " Measurement"
    ] }),
    /* @__PURE__ */ u3("div", { class: "grid gap-3 md:grid-cols-2", children: [
      /* @__PURE__ */ u3("label", { class: "block", children: [
        /* @__PURE__ */ u3("span", { class: "text-xs text-text-muted", children: "Name" }),
        /* @__PURE__ */ u3(
          "input",
          {
            class: "mt-1 block w-full rounded border border-border bg-surface px-2 py-1.5 text-sm",
            value: name,
            onInput: (e3) => setName(e3.target.value)
          }
        )
      ] }),
      /* @__PURE__ */ u3("label", { class: "block", children: [
        /* @__PURE__ */ u3("span", { class: "text-xs text-text-muted", children: "Device" }),
        /* @__PURE__ */ u3(
          "select",
          {
            class: "mt-1 block w-full rounded border border-border bg-surface px-2 py-1.5 text-sm",
            value: deviceId,
            onChange: (e3) => setDeviceId(e3.target.value),
            children: [
              /* @__PURE__ */ u3("option", { value: "", children: "Select device..." }),
              foundDevices.map((d3) => /* @__PURE__ */ u3("option", { value: String(d3.id), children: d3.name }, d3.id))
            ]
          }
        )
      ] }),
      /* @__PURE__ */ u3("label", { class: "block", children: [
        /* @__PURE__ */ u3("span", { class: "text-xs text-text-muted", children: "Source Path" }),
        /* @__PURE__ */ u3(
          "input",
          {
            class: "mt-1 block w-full rounded border border-border bg-surface px-2 py-1.5 text-sm font-mono",
            placeholder: "e.g. temperatures[4]",
            value: sourcePath,
            onInput: (e3) => setSourcePath(e3.target.value)
          }
        )
      ] }),
      /* @__PURE__ */ u3("label", { class: "block", children: [
        /* @__PURE__ */ u3("span", { class: "text-xs text-text-muted", children: "Update Period (seconds)" }),
        /* @__PURE__ */ u3(
          "input",
          {
            type: "number",
            min: "1",
            class: "mt-1 block w-full rounded border border-border bg-surface px-2 py-1.5 text-sm",
            value: updatePeriod,
            onInput: (e3) => setUpdatePeriod(e3.target.value)
          }
        )
      ] }),
      /* @__PURE__ */ u3("label", { class: "block", children: [
        /* @__PURE__ */ u3("span", { class: "text-xs text-text-muted", children: "Units" }),
        /* @__PURE__ */ u3(
          "input",
          {
            class: "mt-1 block w-full rounded border border-border bg-surface px-2 py-1.5 text-sm",
            placeholder: "e.g. \xB0C, PSI",
            value: units,
            onInput: (e3) => setUnits(e3.target.value)
          }
        )
      ] })
    ] }),
    /* @__PURE__ */ u3("div", { class: "flex gap-2", children: [
      /* @__PURE__ */ u3(
        "button",
        {
          class: "rounded bg-active px-3 py-1.5 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50",
          onClick: handleSave,
          disabled: saving || !name || !deviceId,
          children: saving ? "Saving..." : editId !== null ? "Update" : "Create"
        }
      ),
      /* @__PURE__ */ u3(
        "button",
        {
          class: "rounded border border-border px-3 py-1.5 text-sm font-medium text-text-muted hover:text-text",
          onClick: onClose,
          children: "Cancel"
        }
      ),
      editId !== null && /* @__PURE__ */ u3(
        "button",
        {
          class: "ml-auto rounded border border-error px-3 py-1.5 text-sm font-medium text-error hover:bg-error-bg",
          onClick: handleDelete,
          children: "Delete"
        }
      )
    ] })
  ] });
}
function DeviceCard({ device, interfaces }) {
  if (!device._found) return null;
  const d3 = device;
  const state = d3.current_state;
  const iface = interfaces.find((i3) => i3._found && i3.id === d3.host_interface_id);
  const ifaceFound = iface?._found ? iface : null;
  return /* @__PURE__ */ u3("div", { class: "rounded-lg border border-border bg-surface p-4 space-y-3", children: [
    /* @__PURE__ */ u3("div", { class: "flex items-center justify-between", children: [
      /* @__PURE__ */ u3("h2", { class: "text-sm font-semibold", children: d3.name }),
      /* @__PURE__ */ u3(StatusBadge, { status: state?.status ?? null })
    ] }),
    /* @__PURE__ */ u3("div", { class: "flex items-center gap-2 text-xs text-text-muted", children: [
      /* @__PURE__ */ u3("span", { children: [
        "Addr ",
        d3.modbus_address
      ] }),
      ifaceFound && /* @__PURE__ */ u3("span", { children: [
        "on ",
        ifaceFound.port
      ] })
    ] }),
    state?.data && /* @__PURE__ */ u3(DeviceData, { data: state.data }),
    state?.polled_at && /* @__PURE__ */ u3("p", { class: "text-xs text-text-muted", children: [
      "Polled: ",
      new Date(state.polled_at).toLocaleTimeString()
    ] })
  ] });
}
function StatusBadge({ status }) {
  if (status === "ok") {
    return /* @__PURE__ */ u3("span", { class: "inline-block rounded-full bg-ok-bg px-2 py-0.5 text-xs font-medium text-ok", children: "OK" });
  }
  if (status === "error") {
    return /* @__PURE__ */ u3("span", { class: "inline-block rounded-full bg-error-bg px-2 py-0.5 text-xs font-medium text-error", children: "Error" });
  }
  return /* @__PURE__ */ u3("span", { class: "inline-block rounded-full bg-surface-alt px-2 py-0.5 text-xs font-medium text-text-muted", children: "Unknown" });
}
function DeviceData({ data }) {
  if ("temperatures" in data) {
    const temps = data.temperatures;
    const active = temps.map((t3, i3) => ({ ch: i3 + 1, temp: t3 })).filter((t3) => t3.temp !== null);
    return /* @__PURE__ */ u3("div", { class: "grid grid-cols-2 gap-1", children: [
      active.map(({ ch, temp }) => /* @__PURE__ */ u3("div", { class: "flex justify-between rounded bg-surface-alt px-2 py-1 text-sm", children: [
        /* @__PURE__ */ u3("span", { class: "text-text-muted", children: [
          "Ch ",
          ch
        ] }),
        /* @__PURE__ */ u3("span", { class: "font-mono font-medium", children: [
          temp.toFixed(1),
          "\xB0C"
        ] })
      ] }, ch)),
      active.length === 0 && /* @__PURE__ */ u3("p", { class: "col-span-2 text-xs text-text-muted", children: "No active channels" })
    ] });
  }
  if ("outputs" in data && "inputs" in data) {
    const outputs = data.outputs;
    const inputs = data.inputs;
    return /* @__PURE__ */ u3("div", { class: "space-y-2", children: [
      /* @__PURE__ */ u3(IORow, { label: "Outputs", values: outputs }),
      /* @__PURE__ */ u3(IORow, { label: "Inputs", values: inputs })
    ] });
  }
  return /* @__PURE__ */ u3("pre", { class: "text-xs overflow-auto", children: JSON.stringify(data, null, 2) });
}
function IORow({ label, values }) {
  return /* @__PURE__ */ u3("div", { children: [
    /* @__PURE__ */ u3("p", { class: "text-xs text-text-muted mb-1", children: label }),
    /* @__PURE__ */ u3("div", { class: "flex gap-1", children: values.map((v3, i3) => /* @__PURE__ */ u3(
      "div",
      {
        class: `h-6 w-6 rounded text-center text-xs leading-6 font-mono ${v3 ? "bg-ok text-white" : "bg-surface-alt text-text-muted"}`,
        children: i3 + 1
      },
      i3
    )) })
  ] });
}

// src/main.tsx
R(/* @__PURE__ */ u3(App, {}), document.getElementById("root"));
//# sourceMappingURL=app.js.map
