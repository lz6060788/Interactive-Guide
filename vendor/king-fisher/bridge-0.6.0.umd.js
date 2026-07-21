(function (global, factory) {
  typeof exports === 'object' && typeof module !== 'undefined' ? module.exports = factory() :
  typeof define === 'function' && define.amd ? define(factory) :
  (global = typeof globalThis !== 'undefined' ? globalThis : global || self, global["kingfisher-bridge"] = factory());
})(this, (function () { 'use strict';

  /******************************************************************************
  Copyright (c) Microsoft Corporation.

  Permission to use, copy, modify, and/or distribute this software for any
  purpose with or without fee is hereby granted.

  THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES WITH
  REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF MERCHANTABILITY
  AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR ANY SPECIAL, DIRECT,
  INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES WHATSOEVER RESULTING FROM
  LOSS OF USE, DATA OR PROFITS, WHETHER IN AN ACTION OF CONTRACT, NEGLIGENCE OR
  OTHER TORTIOUS ACTION, ARISING OUT OF OR IN CONNECTION WITH THE USE OR
  PERFORMANCE OF THIS SOFTWARE.
  ***************************************************************************** */

  var __assign = function() {
    __assign = Object.assign || function __assign(t) {
        for (var s, i = 1, n = arguments.length; i < n; i++) {
            s = arguments[i];
            for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p)) t[p] = s[p];
        }
        return t;
    };
    return __assign.apply(this, arguments);
  };

  typeof SuppressedError === "function" ? SuppressedError : function (error, suppressed, message) {
    var e = new Error(message);
    return e.name = "SuppressedError", e.error = error, e.suppressed = suppressed, e;
  };

  /**
   * @author Wayne
   * @Date 2022-07-14 10:23:10
   * @LastEditTime 2022-07-18 19:35:58
   */
  var getRandomId = function () { return String(Math.random()).slice(-6) + String(+new Date()).slice(-6); };
  /**
   * @function getFormattedRes
   * @description 处理客户端响应数据
   * @param val
   * @returns
   */
  var getFormattedRes = function (val) {
      if (typeof val === 'string' && val[0] === '{') {
          try {
              return JSON.parse(val);
          }
          catch (err) {
              return val;
          }
      }
      return val;
  };
  /**
   * @function handleEnvWarnning
   * @param options
   */
  var handleEnvWarnning = function (options) {
      {
          console.warn("actionName(".concat(options === null || options === void 0 ? void 0 : options.actionName, ") is not supported!(falcon-web)"));
      }
  };

  /**
   * @author Wayne
   * @Date 2022-07-11 15:00:24
   * @LastEditTime 2022-11-30 21:17:23
   */
  var callFalconWebNativeHandler = 
  // iOS Falcon
  typeof window._falcon !== 'undefined'
      ? function (_a) {
          var actionName = _a.actionName, componentName = _a.componentName, objectId = _a.objectId, syncFuncName = _a.syncFuncName, params = _a.params, callbackId = _a.callbackId;
          var res = callbackId
              ? window.prompt(actionName, JSON.stringify([componentName, objectId, syncFuncName, params, callbackId]))
              : window.prompt(actionName, JSON.stringify([componentName, objectId, syncFuncName, params]));
          return getFormattedRes(res);
      }
      : // Android Falcon
          typeof window.FalconJavaInterface !== 'undefined'
              ? function (_a) {
                  var actionName = _a.actionName, componentName = _a.componentName, objectId = _a.objectId, syncFuncName = _a.syncFuncName, params = _a.params, callbackId = _a.callbackId;
                  var res = callbackId
                      ? window.FalconJavaInterface[actionName](componentName, objectId, syncFuncName, JSON.stringify(params), callbackId)
                      : window.FalconJavaInterface[actionName](componentName, objectId, syncFuncName, JSON.stringify(params));
                  return getFormattedRes(res);
              }
              : handleEnvWarnning;
  var initCallFalconNative = function () {
      if (!window.Falcon) {
          window.Falcon = {
              // 回调
              _callbackMap: {},
              _addCallback: function (func, name) {
                  var id = (name || '') + '-' + getRandomId();
                  window.Falcon._callbackMap[id] = func;
                  return id;
              },
              _callbackMapOn: {},
              _addCallbackOn: function (func, name) {
                  var id = (name || '') + '-' + getRandomId();
                  window.Falcon._callbackMapOn[id] = func;
                  return id;
              },
              //注册客户端事件回调
              _addEventCallback: function (name, func) {
                  var funcSet = window.Falcon._callbackMap[name];
                  if (!funcSet) {
                      funcSet = new Set();
                      window.Falcon._callbackMap[name] = funcSet;
                  }
                  funcSet.add(func);
              },
              _removeEventCallback: function (name, func) {
                  if (!func) {
                      delete window.Falcon._callbackMap[name];
                      return;
                  }
                  var funcSet = window.Falcon._callbackMap[name];
                  if (funcSet) {
                      funcSet.delete(func);
                      if (funcSet.size === 0) {
                          delete window.Falcon._callbackMap[name];
                      }
                  }
              },
              callback: function (jsonString, callbackId) {
                  var func = window.Falcon._callbackMap[callbackId];
                  if (func) {
                      func(getFormattedRes(jsonString));
                      delete window.Falcon._callbackMap[callbackId];
                      return;
                  }
                  var funcOn = window.Falcon._callbackMapOn[callbackId];
                  if (funcOn) {
                      funcOn(getFormattedRes(jsonString));
                  }
              },
              // 注册客户端事件
              // _callMap: {} as CallbackMap,
              call: function (funcName, jsonString) {
                  var funcSet = window.Falcon._callbackMap[funcName];
                  if (funcSet) {
                      var res_1;
                      funcSet.forEach(function (func) {
                          res_1 = func(getFormattedRes(jsonString));
                      });
                      return res_1;
                  }
              },
              // 注册订阅事件
              // _customEventMap: {} as CallbackMap,
              sendCustomEvent: function (apiName, jsonString) {
                  var funcSet = window.Falcon._callbackMap[apiName];
                  if (funcSet) {
                      var res_2;
                      funcSet.forEach(function (func) {
                          res_2 = func(getFormattedRes(jsonString));
                      });
                      return res_2;
                  }
              },
          };
      }
      // 网页，异步回调
      window.falconCallback = window.Falcon.callback;
      // 网页，客户端事件
      window.falconCall = window.Falcon.call;
      // 网页，监听事件
      window.falconSendCustomEvent = window.Falcon.sendCustomEvent;
      return window.Falcon;
  };
  // 调用层
  var callNativeHandlerSync = function (syncFuncName, params) {
      return callFalconWebNativeHandler({
          actionName: 'invokeSync',
          componentName: 'fl',
          objectId: '',
          syncFuncName: syncFuncName,
          params: params,
      });
  };
  var callNativeHandlerAsync = function (asyncFuncName, params, callback, objectId) {
      var _a;
      var callbackId = (_a = window.Falcon) === null || _a === void 0 ? void 0 : _a._addCallback(callback, asyncFuncName);
      callFalconWebNativeHandler({
          actionName: 'invokeAsync',
          // 静态方法直接调用 componentName 为 fl，objectId 为空
          componentName: objectId ? asyncFuncName : 'fl',
          objectId: objectId || '',
          syncFuncName: asyncFuncName,
          params: params,
          callbackId: callbackId,
      });
  };
  /**
   * king-fisher web的实例组件异步调用
   */
  var callNativeHandlerObj = function (componentName, asyncFuncName, params, callback, objectId, on) {
      var _a, _b;
      if (on === void 0) { on = false; }
      var callbackId = on ? (_a = window.Falcon) === null || _a === void 0 ? void 0 : _a._addCallbackOn(callback, asyncFuncName) : (_b = window.Falcon) === null || _b === void 0 ? void 0 : _b._addCallback(callback, asyncFuncName);
      callFalconWebNativeHandler({
          actionName: 'invokeAsync',
          componentName: componentName,
          objectId: objectId || '',
          syncFuncName: asyncFuncName,
          params: params,
          callbackId: callbackId,
      });
      return callbackId;
  };
  var removeCallback = function (callbackId) {
      var _a;
      (_a = window.Falcon) === null || _a === void 0 ? true : delete _a._callbackMapOn[callbackId];
  };
  /**
   * king-fisher web的实例组件同步调用
   */
  var callNativeHandlerObjSync = function (componentName, syncFuncName, params, objectId) {
      return callFalconWebNativeHandler({
          actionName: 'invokeSync',
          componentName: componentName,
          objectId: objectId || '',
          syncFuncName: syncFuncName,
          params: params,
      });
  };
  /**
   * king-fisher web注册客户端事件监听
   */
  var registerEventHandler = function (syncFuncName, params, callback) {
      var _a;
      (_a = window.Falcon) === null || _a === void 0 ? void 0 : _a._addEventCallback(syncFuncName, callback);
  };
  var unregisterEventHandler = function (syncFuncName, params, callback) {
      var _a;
      (_a = window.Falcon) === null || _a === void 0 ? void 0 : _a._removeEventCallback(syncFuncName, callback);
  };
  var removeComponent = function (componentName, objectId) {
      // ios falcon
      if (typeof window._falcon !== 'undefined') {
          window.prompt('removeComponent', JSON.stringify([componentName, objectId]));
      }
      // android falcon
      else if (typeof window.FalconJavaInterface !== 'undefined') {
          window.FalconJavaInterface.removeComponent(componentName, objectId);
      }
  };
  var removeComponents = function (componentName) {
      // ios falcon
      if (typeof window._falcon !== 'undefined') {
          window.prompt('removeComponents', JSON.stringify([componentName]));
      }
      // android falcon
      else if (typeof window.FalconJavaInterface !== 'undefined') {
          window.FalconJavaInterface.removeComponents(componentName);
      }
  };
  var web = {
      initCallFalconNative: initCallFalconNative,
      callNativeHandlerSync: callNativeHandlerSync,
      callNativeHandlerAsync: callNativeHandlerAsync,
      callNativeHandlerObj: callNativeHandlerObj,
      callNativeHandlerObjSync: callNativeHandlerObjSync,
      registerEventHandler: registerEventHandler,
      unregisterEventHandler: unregisterEventHandler,
      removeComponent: removeComponent,
      removeComponents: removeComponents,
      removeCallback: removeCallback
  };

  /**
   * @utils type
   * @description data type check
   * @author Wayne
   * @createTime 2022-03-28 21:12:49
   * @lastModified 2022-04-29 09:54:30
   */
  /**
   * @function type
   * @description **type(val)** get the variable value's type
   * @param {unknown} val variable value
   * @return {String} type string
   * @example
   * const test1 = [1, 2, 3],
   *     test2 = { a: 1, b: '2' },
   *     test3 = 'abc',
   *     test4;
   * type(test1);  // 'Array'
   * type(test2);  // 'Object'
   * type(test3);  // 'String'
   * type(test4);  // 'Undefined'
   */
  function type(val) {
      return Object.prototype.toString.call(val).replace(/\[object\s|\]/g, '');
  }
  /**
   * @function isUndefined
   * @description **isUndefined(val)** if the variable value is undefined
   * @param {unknown} val variable value
   * @return {Boolean}
   * @example
   * const test1 = [1, 2, 3],
   *     test2;
   * isString(test1);  // false
   * isString(test2);  // true
   */
  function isUndefined(val) {
      // eslint-disable-next-line no-undefined
      return val === undefined;
  }
  /**
   * @function isArray
   * @description **isArray(val)** if the variable value is Array.(Array.isArray: android 5+)
   * @param {unknown} val value
   * @return {Boolean}
   * @example
   * const test1 = [1, 2, 3],
   *     test2 = { a: 1, b: '2' };
   * isArray(test1);  // true
   * isArray(test2);  // false
   */
  var isArray = function (val) { return type(val) === 'Array'; };
  /**
   * @function isFunction
   * @description **isFunction(val)** if the variable value is Function
   * @param {unknown} val variable value
   * @return {Boolean}
   * @example
   * const test1 = [1, 2, 3],
   *     test2 = function () { alert(1) };
   * isFunction(test1);  // false
   * isFunction(test2);  // true
   */
  // eslint-disable-next-line @typescript-eslint/ban-types
  function isFunction(val) {
      return typeof val === 'function';
  }

  /**
   * @author Wayne
   * @description 原本bridgejs改造（https://s.thsi.cn/js/m/v2.12/common/bridge.js）
   * @createTime 2022-07-11 13:23:22
   * @lastModified 2022-07-11 15:58:11
   */
  /**
   * @todo 结合Falcon bridge进行改造
   */
  function callNativeHandler(action, data, callback) {
      if (window.WebViewJavascriptBridge) {
          if (!isUndefined(callback)) {
              window.WebViewJavascriptBridge.callHandler(action, data, callback);
          }
          else {
              window.WebViewJavascriptBridge.callHandler(action, data);
          }
      }
      else {
          document.addEventListener('WebViewJavascriptBridgeReady', function () {
              if (!isUndefined(callback)) {
                  window.WebViewJavascriptBridge.callHandler(action, data, callback);
              }
              else {
                  window.WebViewJavascriptBridge.callHandler(action, data);
              }
          }, false);
      }
  }
  //定义WEB API供给客户端使用 handlername为客户端调用web 函数的协议名字 callfunction参数为一个函数,他有两个参数msgdata和callbackfunction
  function registerWebHandler(handlerName, callFunc) {
      if (window.WebViewJavascriptBridge) {
          window.WebViewJavascriptBridge.registerHandler(handlerName, callFunc);
      }
      else {
          document.addEventListener('WebViewJavascriptBridgeReady', function () {
              window.WebViewJavascriptBridge.registerHandler(handlerName, callFunc);
          }, false);
      }
  }
  // for NotifyNativeEventToWeb(key) notifyWebHandleEvent(method)
  function registerWebHandlerRepeated(handlerName, method, callFunc) {
      try {
          if (!window.nativeRepeated) {
              window.nativeRepeated = {};
          }
          if (!window.nativeRepeated[handlerName]) {
              window.nativeRepeated[handlerName] = {};
              window.nativeRepeated[handlerName][method] = [callFunc];
          }
          else {
              if (!window.nativeRepeated[handlerName][method]) {
                  window.nativeRepeated[handlerName][method] = [callFunc];
              }
              else {
                  window.nativeRepeated[handlerName][method].push(callFunc);
              }
              return false;
          }
          if (window.WebViewJavascriptBridge) {
              window.WebViewJavascriptBridge.registerHandler(handlerName, function (data) {
                  var handlerMethod = (data.method || data.key);
                  if (handlerMethod) {
                      if (window.nativeRepeated[handlerName][handlerMethod] &&
                          isArray(window.nativeRepeated[handlerName][handlerMethod])) {
                          for (var i = 0; i < window.nativeRepeated[handlerName][handlerMethod].length; i++) {
                              window.nativeRepeated[handlerName][handlerMethod][i](data);
                          }
                      }
                  }
              });
          }
          else {
              document.addEventListener('WebViewJavascriptBridgeReady', function () {
                  window.WebViewJavascriptBridge.registerHandler(handlerName, function (data) {
                      var handlerMethod = (data.method || data.key);
                      if (handlerMethod) {
                          if (window.nativeRepeated[handlerName][handlerMethod] &&
                              isArray(window.nativeRepeated[handlerName][handlerMethod])) {
                              for (var i = 0; i < window.nativeRepeated[handlerName][handlerMethod].length; i++) {
                                  window.nativeRepeated[handlerName][handlerMethod][i](data);
                              }
                          }
                      }
                  });
              }, false);
          }
      }
      catch (err) {
          // no need handle
      }
  }
  //定义WEB API供给客户端使用 handlername为客户端调用web 函数的协议名字 callfunction参数为一个函数,他有两个参数msgdata和callbackfunction
  //与registerWebHandler区别，无需先调用callNativeHandler
  //将废弃
  function registerWebListener(handlerName, callFunc) {
      try {
          if (window.WebViewJavascriptBridge) {
              window.WebViewJavascriptBridge.registerListener(handlerName, callFunc);
          }
          else {
              document.addEventListener('WebViewJavascriptBridgeReady', function () {
                  window.WebViewJavascriptBridge.registerListener(handlerName, callFunc);
              }, false);
          }
      }
      catch (err) {
          // no need handle
      }
  }
  //定义默认事件函数
  /*
  function initWebViewJavascriptBridge(message, responseCallback){
      var data = { 'Javascript Responds':'Unsupported!' };
      responseCallback(data);
      responseCallback(message);
  }
  */
  //初始化 连接桥函数定义
  function connectWebViewJavascriptBridge() {
      // 如果是falcon则不注册
      try {
          if (typeof window._falcon !== 'undefined' || typeof window.FalconJavaInterface !== 'undefined') {
              return;
          }
          if (window.WebViewJavascriptBridge) {
              if (!window.WebViewJavascriptBridge._messageHandler) {
                  window.WebViewJavascriptBridge.init(window.initWebViewJavascriptBridge);
              }
          }
          else {
              document.addEventListener('WebViewJavascriptBridgeReady', function () {
                  if (!window.WebViewJavascriptBridge._messageHandler) {
                      window.WebViewJavascriptBridge.init(window.initWebViewJavascriptBridge);
                  }
              }, false);
              var ua = navigator.userAgent;
              var platform = ua.indexOf('iPhone') > -1 || ua.indexOf('Mac') > -1 || ua.indexOf('iPad') > -1
                  ? 'iphone'
                  : 'gphone';
              if (platform === 'iphone') {
                  var WVJBIframe_1 = document.createElement('iframe');
                  WVJBIframe_1.style.display = 'none';
                  WVJBIframe_1.src = 'wvjbscheme://__BRIDGE_LOADED__';
                  document.documentElement.appendChild(WVJBIframe_1);
                  setTimeout(function () {
                      document.documentElement.removeChild(WVJBIframe_1);
                  }, 0);
              }
          }
      }
      catch (error) {
          //nothing
      }
  }
  //设置默认协议处理函数为console.log
  if (isFunction(window.initWebViewJavascriptBridge)) {
      window.initWebViewJavascriptBridge = function (message, responseCallback) {
          console.log("message: ".concat(message));
          console.log("callback: ".concat(responseCallback));
      };
  }
  //初始化webviewbridge
  connectWebViewJavascriptBridge();
  if (!window.callNativeHandler) {
      window.callNativeHandler = callNativeHandler;
  }
  if (!window.registerWebHandler) {
      window.registerWebHandler = registerWebHandler;
  }
  if (!window.registerWebListener) {
      window.registerWebListener = registerWebListener;
  }
  if (!window.registerWebHandlerRepeated) {
      window.registerWebHandlerRepeated = registerWebHandlerRepeated;
  }
  function callNativePromise(action, data) {
      return new Promise(function (resolve) {
          callNativeHandler(action, data, function (res) {
              if (typeof res === 'string') {
                  resolve(JSON.parse(res));
              }
              else {
                  resolve(res);
              }
          });
      });
  }
  var thsWeb = {
      callNativePromise: callNativePromise
  };

  if (typeof window._falcon !== 'undefined' || typeof window.FalconJavaInterface !== 'undefined') {
      web.initCallFalconNative();
  }
  var index_web = __assign(__assign({}, web), thsWeb);

  return index_web;

}));
