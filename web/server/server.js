const fs = require('fs');
const https = require('https');
const http = require('http');
const WebSocket = require('ws');

var SignalServer = (function () {
  function SignalServer() {
    this.connected_clients = [];
    this.routing_table = [];
    this.http_server = null;
    this.wss = null;
  }

  SignalServer.prototype.listen = function(httpServerConfig, port, addr) {
    //this.http_server = https.createServer(httpServerConfig, this.handleHttpRequest);
    this.http_server = http.createServer(this.handleHttpRequest);
    this.http_server.listen(port, addr);
    this.wss = new WebSocket.Server({server: this.http_server});
    this.wss.on('connection', (ws, req) => {
      var ip = req.connection.remoteAddress;
      var port = req.connection.remotePort;
      var remote_endpoint = "peer@" + ip + ":" + port;
      ws.on('message', (msg) => { this.onWebSocketMessage(ws, remote_endpoint, msg); });
      ws.on('close', () => { this.onWebSocketClose(remote_endpoint); });
    });

    // var self = this;
    //setInterval(function() {
    //  for (var i = 0; i < self.connected_clients; ++i) {
    //    console.log("state:" + self.connected_clients[i].readyState);
    //    if (self.connected_clients[i].ws) {
    //    }
    //  }
    //}, 1000);
  }

  SignalServer.prototype.handleHttpRequest = function(req, res) {
    if (req.url === '/') {
      res.writeHead(200, {'Content-Type': 'text/html'});
      res.end(fs.readFileSync('client/index.html'));
    }
    else if (req.url == '/webrtc.js') {
      res.writeHead(200, {'Content-Type': 'application/javascript'});
      res.end(fs.readFileSync('client/webrtc.js'));
    }
  }

  SignalServer.prototype.onWebSocketMessage = function(ws, remote_endpoint, msg) {
    console.log("========WEBSOCKET_MESSAGE===================");
    console.log("msg:" + msg);
    var json = null;
    try {
      json = JSON.parse(msg);
    }
    catch (err) {
      console.log("err");
    }
    if (json.command) {
      switch (json.command) {

        // client registers with hello
        case "hello":
          this.onCommandHello(ws, remote_endpoint, json);
          break;

        // client requests streaming video with talk
        case "talk":
          this.onCommandTalk(ws, remote_endpoint, json);
          break;

        default:
          this.forwardToPeer(ws, json);
          break;
      }
    }
    else {
      this.forwardToPeer(ws, json);
    }
  }

  SignalServer.prototype.forwardToPeer = function(id, json) {
    console.log("==========FORWARD_TO_PEER=================");
    console.log("fwd:" + JSON.stringify(json));
    var to = null;
    if (json.alias) {
      for (var i in this.connected_clients) {
        if (this.connected_clients[i].name == json.alias) {
          to = this.connected_clients[i].id;
          break;
        }
      }
    }
    else {
      to = json.to;
    }

    for (var i in this.routing_table) {
      route = this.routing_table[i];
      console.log(json.from + " == " + route.from + " && " + to + " == " + route.to);
      if (json.from == route.from && route.to == to) {
        route.to_ws.send(JSON.stringify(json));
      }
    }
  }

  SignalServer.prototype.onCommandTalk = function(ws, remote_endpoint, json) {
    var peer = null;
    for (var i in this.connected_clients) {
      if (this.connected_clients[i].name == json.alias) {
        peer = this.connected_clients[i];
        break;
      }
    }
    if (peer) {
      route = new Object();
      route.to = peer.id;
      route.to_ws = peer.ws;
      route.from = json.from;
      route.from_ws = ws;
      this.routing_table.push(route);

      route = new Object();
      route.to = json.from;
      route.to_ws = ws;
      route.from = peer.id;
      route.from_ws = peer.ws;
      this.routing_table.push(route);
    }
  }

  SignalServer.prototype.onCommandHello = function(ws, remote_endpoint, json) {
    var entry = new Object();
    entry.ws = ws;
    entry.name = json.name;
    entry.remote_endpoint = remote_endpoint;
    entry.id = json.id;
    this.connected_clients.push(entry);
    console.log("added new client:" + json.name + "/" + remote_endpoint);
  }

  SignalServer.prototype.onWebSocketClose = function(remote_endpoint) {
    var id_removed = null;
    for (var i in this.connected_clients) {
      if (this.connected_clients[i].remote_endpoint == remote_endpoint) {
        id_removed = this.connected_clients[i].id;
        this.connected_clients.splice(i, 1);
        console.log("removed:" + remote_endpoint);
        break;
      }
    }
    if (id_removed) {
      var new_routing_table = [];
      for (var i in this.routing_table) {
        if (this.routing_table[i].to == id_removed) {
          // notify other side that this is gone
          var closed = new Object();
          closed.to = this.routing_table[i].from;
          closed.notify = "closed";
          closed.from = "signal_server";
          this.routing_table[i].from_ws.send(JSON.stringify(closed));
          this.routing_table[i] = null;
        }
        else if (this.routing_table[i].from == id_removed) {
          var closed = new Object();
          closed.to = this.routing_table[i].to;
          closed.notify = "closed";
          closed.from = "signal_server";
          this.routing_table[i].to_ws.send(JSON.stringify(closed));
          this.routing_table[i] = null;
        }
      }
      for (var i in this.routing_table) {
        if (this.routing_table[i] != null) {
          new_routing_table.push(this.routing_table[i]);
        }
      }
      this.routing_table = new_routing_table;
    }
    console.log("id_removed:" + id_removed);
    console.log("================ID REMOVED=================");
  }

  return SignalServer;
})();

function preferH264(sdp) {
  var h264_index = -1;
  var tokens = sdp.split("\\r\\n");
  for (i = 0; i < tokens.length; ++i) {
    var res = tokens[i].match(/rtpmap:(\d+) H264/); // (\d+) H264/g);
    // console.log("[" + i + "]:" + tokens[i]);
    if (res) {
      h264_index = res[1];
    }
  }

  if (h264_index == -1)
    return sdp;

  for (i = 0; i < tokens.length; ++i) {
    var res = tokens[i].match(/^m=video/);
    if (res) {
      res = tokens[i].match(/(\s+\d+)+$/);
      if (res) {
        var s = res[0].trim();
        var codecs = s.split(" ");
        var idx = codecs.indexOf(h264_index);
        if (idx != -1) {
          codecs.splice(idx, 1);
          codecs.splice(0, 0, h264_index);
        }

        var codec_list = "";
        for (j = 0; j < codecs.length; ++j) {
          if (j > 0)
            codec_list += " ";
          codec_list += codecs[j];
        }

        var media_entry = tokens[i].replace(s, codec_list);
        tokens[i] = media_entry;
      }
    }
  }

  var new_sdp = "";
  for (i = 0; i < tokens.length; ++i) {
    if (tokens[i].length == 0)
      continue;
    if (i > 0)
      new_sdp += "\\r\\n";
    new_sdp += tokens[i];
  }

  return new_sdp;
}


/*
wss.broadcast = function(data) {
  this.clients.forEach(function(client) {
      if (client.readyState === WebSocket.OPEN) {
        client.send(data);
      }
  });
};
*/

const serverConfig = { 
  key  : fs.readFileSync('key.pem'),
  cert : fs.readFileSync('cert.pem'),
};

server = new SignalServer();
server.listen(serverConfig, 8443, "0.0.0.0");
