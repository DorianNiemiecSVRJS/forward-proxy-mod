var http = require("http");
var https = require("https");
var net = require("net");
var tls = require("tls");

function Mod() {}
Mod.prototype.callback = function callback(req, res, serverconsole, responseEnd, href, ext, uobject, search, defaultpage, users, page404, head, foot, fd, elseCallback, configJSON, callServerError, getCustomHeaders, origHref, redirect, parsePostData) {
  return function () {
    if (!res.writeHead) {
      Mod.prototype.proxyCallback(req, res, serverconsole, responseEnd, href, ext)();
      return;
    }
    var isProxy = (req.url && req.url.match(/^https?:\/\//));
    if (isProxy) {
      var reqUObject = {};
      try {
        reqUObject = new URL(req.url);
      } catch (ex) {
        callServerError(400, "forward-proxy-mod/1.0.0"); // Malformed URL
        serverconsole.errmessage("Invalid request!");
      }
      var hdrs = JSON.parse(JSON.stringify(req.headers));
      delete hdrs[":method"];
      delete hdrs[":scheme"];
      delete hdrs[":authority"];
      delete hdrs[":path"];
      delete hdrs["keep-alive"];
      if ((req.httpVersion == "1.1" || req.httpVersion == "1.0") && String(hdrs["connection"]).toLowerCase() == "upgrade") {
        var socket = ((reqUObject.protocol == "https:") ? tls : net).createConnection({
          host: reqUObject.hostname,
          port: reqUObject.port ? parseInt(reqUObject.port) : ((reqUObject.protocol == "https:") ? 443 : 80),
          joinDuplicateHeaders: true,
          rejectUnauthorized: false
        }, function () {
          serverconsole.resmessage("Connected to back-end!");
          socket.pipe(res.socket);
          socket.write(req.method + " " + reqUObject.pathname + reqUObject.search + reqUObject.hash + " HTTP/1.1\r\n");
          Object.keys(hdrs).forEach(function (headerName) {
            var header = hdrs[headerName];
            if (typeof header === "object") {
              header.forEach(function (value) {
                socket.write(headerName + ": " + value + "\r\n");
              });
            } else {
              socket.write(headerName + ": " + header + "\r\n");
            }
          });
          socket.write("\r\n");
          req.socket.pipe(socket);
        }).on("error", function (ex) {
          try {
            if (ex.code == "ENOTFOUND" || ex.code == "EHOSTUNREACH" || ex.code == "ECONNREFUSED") {
              callServerError(503, "forward-proxy-mod/1.0.0", ex); //Server error
            } else if (ex.code == "ETIMEDOUT") {
              callServerError(504, "forward-proxy-mod/1.0.0", ex); //Server error
            } else {
              callServerError(502, "forward-proxy-mod/1.0.0", ex); //Server error
            }
          } catch (ex) {}
          serverconsole.errmessage("Client fails to recieve content."); //Log into SVR.JS
        });
      } else {
        if (String(hdrs["connection"]).toLowerCase() != "upgrade") hdrs["connection"] = "close";
        var options = {
          hostname: reqUObject.hostname,
          port: reqUObject.port ? parseInt(reqUObject.port) : ((reqUObject.protocol == "https:") ? 443 : 80),
          path: reqUObject.pathname + reqUObject.search + reqUObject.hash,
          method: req.method,
          headers: hdrs,
          joinDuplicateHeaders: true,
          rejectUnauthorized: false
        };
        var proxy = ((reqUObject.protocol == "https:") ? https : http).request(options, function (sres) {
          serverconsole.resmessage("Connected to back-end!");
          if (String(hdrs["connection"]).toLowerCase() != "upgrade") {
            delete sres.headers["connection"];
            delete sres.headers["Connection"];
          }
          delete sres.headers["transfer-encoding"];
          delete sres.headers["Transfer-Encoding"];
          delete sres.headers["keep-alive"];
          delete sres.headers["Keep-Alive"];
          try {
            res.writeHead(sres.statusCode, sres.headers);
            sres.pipe(res);
            res.prependListener("end", function () {
              try {
                sres.end();
              } catch (ex) {}
            });
          } catch (ex) {
            callServerError(502, "forward-proxy-mod/1.0.0", ex); //Server error
          }
        });
        proxy.on("error", function (ex) {
          try {
            if (ex.code == "ETIMEDOUT") {
              callServerError(504, "forward-proxy-mod/1.0.0", ex); //Server error
            } else {
              callServerError(502, "forward-proxy-mod/1.0.0", ex); //Server error
            }
          } catch (ex) {}
          serverconsole.errmessage("Client fails to receive content."); //Log into SVR.JS
        });
        req.pipe(proxy);
        req.prependListener("end", function () {
          try {
            proxy.end();
          } catch (ex) {}
        });
      }
    } else {
      elseCallback();
    }
  }
}

Mod.prototype.proxyCallback = function proxyCallback(req, socket, head, configJSON, serverconsole, elseCallback) {
  return function () {
    var service = req.url;
    var h = service.match(/^([^:]+):([0-9]{1,4}|[0-5][0-9]{5}|6[0-4][0-9]{3}|65[0-4][0-9]{2}|655[0-2][0-9]|6553[0-5])$/);
    if (!h) {
      if (!socket.destroyed) socket.write("HTTP/1.1 400 Bad Request\n\n");
      serverconsole.errmessage("Invalid request!");
    }
    var dSocket = net.createConnection({
      host: h[1],
      port: parseInt(h[2]),
      joinDuplicateHeaders: true
    }, function () {
      serverconsole.resmessage("Connected to back-end!");
      socket.write("HTTP/1.1 200 OK\n\n");
      dSocket.pipe(socket);
      if (head) dSocket.write(head);
      socket.pipe(dSocket);
    }).on("error", function (ex) {
      try {
        if (ex.code == "ETIMEDOUT") {
          socket.write("HTTP/1.1 504 Gateway Timeout\n\n"); //Server error
        } else {
          socket.write("HTTP/1.1 502 Bad Gateway\n\n"); //Server error
        }
        socket.end();
      } catch (ex) {}
      serverconsole.errmessage("Client fails to receive content."); //Log into SVR.JS
    });
  }
}

module.exports = Mod; //SVR.JS mod export
