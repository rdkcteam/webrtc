process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";

const WebSocket = require('ws');
//const WebRTC = require('/opt/webrtc/webrtc.node');
//const WebRTC = require('/root/kumar/android/webrtc-node-camera-jake/webrtc.node');
const WebRTC = require('/opt/nfs/workspace/jakeserver/webrtc-node-camera-jake/webrtc.node');
//WebRTC.setDebug(true);

// Taken from http://stackoverflow.com/a/105074/515584
// Strictly speaking, it's not a real UUID, but it gets the job done here
function uuid() {
  function s4() {
    return Math.floor((1 + Math.random()) * 0x10000).toString(16).substring(1);
  }
  return s4() + s4() + '-' + s4() + '-' + s4() + '-' + s4() + '-' + s4() + s4() + s4();
}

function SDPEditor_use_only_H264(sdp) {
  var h264_index = -1;
  var bad_codecs = [];

  var tokens = sdp.split("\\r\\n");
  for (i = 0; i < tokens.length; ++i) {
    var res = tokens[i].match(/rtpmap:(\d+) H264/); // (\d+) H264/g);
    // console.log("[" + i + "]:" + tokens[i]);
    if (res) {
      h264_index = res[1];
    }
    else {
      res = tokens[i].match(/rtpmap:(\d+)/);
      if (res) {
        bad_codecs.push(res[1]);
      }
    }
  }

  if (h264_index == -1)
    return sdp;

  for (i = 0; i < tokens.length; ++i) {
    var res = tokens[i].match(/^m=video/);
    if (res) {
      tokens[i] = "m=video 9 RTP/SAVPF " + h264_index;
    }
  }

  for (i = 0; i < tokens.length; ++i) {
    var res = tokens[i].match(/^a=([^:]+):(\d+)/);
    if (res) {
      if (res[2] != h264_index) {
        if (bad_codecs.indexOf(res[2]) != -1) {
          tokens[i] = "";
        }
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

function SDPEditor_preferH264(sdp) {
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

var WebRtcClient = (function () {
  function WebRtcClient(name) {
    this.wss = null;
    this.uri = null;
    this.name = name;
    this.max_peers = 4;
    this.local_stream = null;
    this.prebuilt_peers = [];
    this.uuid = uuid();
  }

  WebRtcClient.prototype.preBuildPeers = function () {
    console.log("prebuilding " + this.max_peers + " WebRTC peer connection(s)");

    var self = this;
    var constraints = {
      audio: false,
      video: {
        optional: [
         { height: 240 },
         { width: 320 },
         { minFrameRate: 15 }
        ]
      }
    };

    WebRTC.getUserMedia(constraints, function (stream) {
      for (var i in self.prebuilt_peers) {
        // self.prebuilt_peers[i].peer_connection.addStream(stream);
      }
      console.log("done getting user media");
      self.local_stream = stream;

      for (var i = 0; i < self.max_peers; ++i) {
        var peer = new Object();
        peer.ice_candidates = [];
        peer.peer_connection = null;
        peer.offer = "";
        peer.available = false;
        peer.index = i;
        peer.remote_client_id = "";
        self.prebuilt_peers.push(peer);
        self.preBuildPeer(self.prebuilt_peers[i], self.local_stream);
      }
    });
  }

  WebRtcClient.prototype.releasePeerForClient = function (remote_client_id) {
    var peer = this.findPeerForClient(remote_client_id);
    if (peer) {
      this.recyclePeer(peer);
    }
  }

  WebRtcClient.prototype.recyclePeer = function (peer) {
    if (peer.peer_connection) {
      console.log("closing peer connection:" + peer.index);

      console.log("removing local streams");
      var streams = peer.peer_connection.getLocalStreams();
      for (var i in streams) {
        console.log("remote stream:" + i);
        peer.peer_connection.removeStream(streams[i]);
      }
      console.log("remove local stream");
      peer.peer_connection.removeStream(this.local_stream);
      console.log("close connection");
      peer.peer_connection.close();
    }
    else {
      console.log("peer connection is null?");
    }
    peer.ice_candidates = [];
    peer.peer_connection = null;
    peer.offer = "";
    peer.available = false;
    peer.remote_client_id = "";
    this.preBuildPeer(peer, this.local_stream);
  }

  WebRtcClient.prototype.findPeerForClient = function (remote_client_id) {
    var peer = null;
    for (var i in this.prebuilt_peers) {
      if (this.prebuilt_peers[i].remote_client_id) {
        if (this.prebuilt_peers[i].remote_client_id == remote_client_id) {
          peer = this.prebuilt_peers[i];
          break;
        }
      }
    }
    return peer;
  }

  WebRtcClient.prototype.tryConnect = function () {
    this.wss = new WebSocket(this.uri);
    var tryConnect = this.tryConnect.bind(this);
    this.wss.onerror = function (e) {
      console.log("ERROR:" + e);
      if (e.code == "ECONNREFUSED") {
        setTimeout(tryConnect, 1000);
      }
    }
    this.wss.onopen = this.onSignalServerOpen.bind(this);
    this.wss.onmessage = this.onSignalServerMessage.bind(this);
    this.wssonclose = this.onSignalServerClosed.bind(this);
  }

  WebRtcClient.prototype.onSignalServerClosed = function () {
    console.log("connection closed to " + this.uri);
    console.log("trying to reconnect");
    this.tryConnect(this.uri);
  }

  WebRtcClient.prototype.onSignalServerOpen = function (e) {
    var hello = new Object();
    hello.command = "hello";
    hello.name = this.name;
    hello.id = this.uuid;
    this.wss.send(JSON.stringify(hello));
  }

  WebRtcClient.prototype.connect = function (uri) {
    this.uri = uri;
    this.tryConnect();
  }

  WebRtcClient.prototype.onSignalServerMessage = function (msg) {
//     console.log("MSG:" + JSON.stringify(msg.data));

    var json = JSON.parse(msg.data);
    if (json.command) {
      switch (json.command) {
        case "start_now":
          this.makeOffer(json.from);
          break;
        default:
          console.log("unhandled command:" + JSON.stringify(msg.data));
          break;
      }
      return;
    }
    else if (json.sdp) {
      var desc = new WebRTC.RTCSessionDescription(json.sdp);
      var peer = this.findPeerForClient(json.from);
      if (peer) {
        var data = msg.data.replace(/ packetization-mode=1/, " level-asymmetry-allowed=1;packetization-mode=1;profile-level-id=42e01f");
        desc = new WebRTC.RTCSessionDescription(JSON.parse(data).sdp);
        console.log("sdp is " + JSON.parse(data).sdp);
        peer.peer_connection.setRemoteDescription(desc, function () {
          if (json.sdp.type == "offer") {
            console.log("we don't accept offers right now.");
          }
        });
      }
      else {
        console.log("null peer");
      }
    }
    else if (json.ice) {
      var peer = this.findPeerForClient(json.from);
      if (peer) {
        peer.peer_connection.addIceCandidate(new WebRTC.RTCIceCandidate(json.ice));
      }
      else {
        console.log("failed to find peer for:" + json.from);
      }
    }
    else if (json.notify) {
      if (json.notify == "closed") {
        // this.releasePeerForClient(json.from);
      }
      else {
        console.log("unhandled notify:" + JSON.stringify(msg.data));
      }
    }
    else {
      console.log("unhandled message:" + JSON.stringify(msg.data));
    }
  }

  WebRtcClient.prototype.sendTo = function (to, obj) {
    obj.to = to;
    obj.from = this.uuid;
    var s = JSON.stringify(obj);
    //console.log('sending:' + s);
    this.wss.send(s);
    obj.to = null;
  }

  WebRtcClient.prototype.makeOffer = function (remote_client_id) {
    var peer = null;
    for (var i in this.prebuilt_peers) {
      if (this.prebuilt_peers[i].available) {
        peer = this.prebuilt_peers[i];
        peer.available = false;
        peer.remote_client_id = remote_client_id;
        break;
      }
      else {
        console.log("skipping unavailable peer:" + i);
      }
    }
    if (peer == null) {
      console.log("no available peers");
    }
    else {
      // send offer BEFORE! ice candidates
      console.log("sending offer from peer:" + peer.index);
      this.sendTo(remote_client_id, peer.offer);
      for (var i in peer.ice_candidates) {
        this.sendTo(remote_client_id, peer.ice_candidates[i]);
      }
    }
  }

  WebRtcClient.prototype.preBuildPeer = function (peer, stream) {
    console.log("prebuilding WebRTC peer connection");

    var peerConnectionConfig = {
      'iceServers': [
//        { 'url': 'stun:stun.services.mozilla.com' },
        { 'url': 'stun:stun.l.google.com:19302' },
//          { 'url': 'stun:40.71.44.212:3478' },
      ]
    };

    var peerConstraints = {
      mandatory: {
        OfferToReceiveAudio: false,
        OfferToReceiveVideo: false
      }
    };

    peer.peer_connection = new WebRTC.RTCPeerConnection(peerConnectionConfig, peerConstraints);
    peer.peer_connection.addStream(stream);
    peer.peer_connection.onicecandidate = function (e) {
      if (e.candidate != null) {
        var candidate = new Object();
        candidate.ice = e.candidate;
        candidate.from = this.uuid;
        peer.ice_candidates.push(candidate);
      }
    };
    peer.peer_connection.onaddstream = function (e) {
      // nothing to do. we shouldn't get and/or care about remote stream unless we're doing 2-way audio
      console.log("stream added to peer[" + peer.index + "]");
    };

    var self = this;
    peer.peer_connection.oniceconnectionstatechange = function (e) {
      console.log("oniceconnectionstatechange for peer[" + peer.index + "]: "
        + peer.peer_connection.iceConnectionState);
      if (peer.peer_connection.iceConnectionState == "disconnected") {
        self.recyclePeer(peer);
      }
    };

    peer.peer_connection.onnegotiationneeded = function () {
      console.log("onnegotiationneeded for peer:" + peer.index);
      peer.peer_connection.createOffer(function (description) {
        console.log("creating offer for peer:" + peer.index);
        peer.peer_connection.setLocalDescription(description, function () {
          console.log("setting local description for peer:" + peer.index);
          offer = JSON.stringify({ 'sdp': peer.peer_connection.localDescription, 'from': this.uuid });
          offer = offer.replace(/a=sendrecv/g, "a=sendonly");
          offer = SDPEditor_preferH264(offer);
          peer.offer = JSON.parse(offer);
          peer.available = true;
          console.log("ready for stream peer:" + peer.index);
        })
      }, function (error) {
        console.log(error);
      });
    };
  }

  return WebRtcClient;
})();

client = new WebRtcClient("kumar_cam");
client.preBuildPeers();
client.connect("ws://192.168.0.15:8443");
