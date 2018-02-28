var localVideo;
var remoteVideo;
var peerConnection;
var uuid;
var start_time;
var video_time;
var camera_name = "kumar_cam";
var remote_description_set = false;
var ice_candidates = [];
var button;

var peerConnectionConfig = {
    'iceServers': [
//         {'urls': 'stun:stun.services.mozilla.com'},
//        {'urls': 'stun:stun.l.google.com:19302'},
      { 'urls': "stun:40.71.44.212:3478" }
    ]
};

function pageReady() {
    uuid = uuid();
    console.log("pageReady:" + uuid);

    // localVideo = document.getElementById('localVideo');
    remoteVideo = document.getElementById('remoteVideo');
    button = document.getElementById("button1");

    //serverConnection = new WebSocket('wss://' + window.location.hostname + ':8443');
    serverConnection = new WebSocket('ws://' + window.location.hostname + ':8443');
    serverConnection.onopen = function(e) {
      console.log("opened");
      var hello = new Object();
      hello.command = "hello";
      hello.name = "SomeBrowser";
      hello.id = uuid;
      serverConnection.send(JSON.stringify(hello));
    }

    serverConnection.onmessage = gotMessageFromServer;

    var constraints = {
        video: true,
        audio: false,
    };

    if(navigator.mediaDevices.getUserMedia) {
        navigator.mediaDevices.getUserMedia(constraints).then(getUserMediaSuccess).catch(errorHandler);
    } else {
        alert('Your browser does not support getUserMedia API');
    }
}

function getUserMediaSuccess(stream) {
//  localStream = stream;
//  localVideo.src = window.URL.createObjectURL(stream);
//  localVideo.src = stream;
//  localVideo.srcObject = stream;
}

function start2() {
  var talk = new Object();
  talk.command = "talk";
  talk.alias = camera_name;
  talk.from = uuid;
  serverConnection.send(JSON.stringify(talk));
  console.log("after talk send command");

  var trigger = Object();
  trigger.command = "start_now";
  trigger.from = uuid;
  trigger.alias = camera_name;
  serverConnection.send(JSON.stringify(trigger));
  start_time = new Date();
  console.log("after start_now send command");
}

function start(isCaller) {
  if (isCaller) {
    start2();
    return;
  }
    peerConnection = new RTCPeerConnection(peerConnectionConfig);
    peerConnection.onicecandidate = gotIceCandidate;
    peerConnection.onaddstream = gotRemoteStream;
    console.log("after peerconnection creation");
    peerConnection.oniceconnectionstatechange = function (e) {
      if (peerConnection.iceConnectionState == "connected") {
        var now = new Date(); 
        var diff = now - start_time;
        button.value = button.value + "/" + diff;
      }
      console.log("icestate:" + peerConnection.iceConnectionState);
    }
//    peerConnection.ontrack = gotRemoteStream;
    // peerConnection.addStream(localStream);
    /*
    localStream.getTracks().forEach(function(track) {
      peerConnection.addTrack(track, localStream);
    });
    */

    if (isCaller) {
      peerConnection.createOffer().then(createdDescription).catch(errorHandler);
      console.log("created offer");
    }
}

function gotMessageFromServer(message) {
    if (!peerConnection) {
      start(false);
    }

    var signal = JSON.parse(message.data);

    if (signal.sdp) {
      console.log("GOT OFFER:" + signal.sdp);
      peerConnection.setRemoteDescription(new RTCSessionDescription(signal.sdp)).then(function() {
        remote_description_set = true;
        if (signal.sdp.type == 'offer') {
          peerConnection.createAnswer().then(createdDescription).catch(errorHandler);
        }
      }).catch(errorHandler);
    }
    else if (signal.ice) {
      console.log("ICE:" + JSON.stringify(signal.ice));
      var candidate = new RTCIceCandidate(signal.ice);
      /*
      if (remote_description_set) {
        peerConnection.addIceCandidate(candidate).catch(errorHandler);
      }
      else {
        ice_candidates.push(candidate);
      }
      */
      peerConnection.addIceCandidate(candidate).catch(errorHandler);
    }
}

function gotIceCandidate(event) {
  if (event.candidate != null) {
    ice = JSON.stringify({'ice': event.candidate, 'alias': camera_name, 'from': uuid});
    // serverConnection.send(JSON.stringify({'ice': event.candidate, 'uuid': uuid}));
    // sdp = JSON.stringify({'sdp': peerConnection.localDescription, 'uuid': uuid});
    // sdp = sdp.replace(/a=sendrecv/g, "a=recvonly");
     console.log("sending ice candiate:" + ice);
    serverConnection.send(ice);
  }
}

function createdDescription(description) {
   console.log('got description');
  peerConnection.setLocalDescription(description).then(function() {
//     console.log("send localDescription");
    serverConnection.send(JSON.stringify({'sdp': peerConnection.localDescription, 'alias': camera_name, 'from': uuid}));
    /*
    for (var i in ice_candidates) {
      peerConnection.addIceCandidate(ice_candidate[i]);
    }
    */
  }).catch(errorHandler);
}

function gotRemoteStream(event) {
  console.log('got remote stream');
  // remoteVideo.src = window.URL.createObjectURL(event.stream);
  remoteVideo.srcObject = event.stream;
  end_time = new Date();
  var diff = end_time - start_time;
  console.log("Elapsed:" + diff);
  button.value = "Elapsed:" + diff;
}

function errorHandler(error) {
  // alert("ERROR:"+ error);
  console.log("ERROR:" + error);
}

// Taken from http://stackoverflow.com/a/105074/515584
// Strictly speaking, it's not a real UUID, but it gets the job done here
function uuid() {
  function s4() {
    return Math.floor((1 + Math.random()) * 0x10000).toString(16).substring(1);
  }

  return s4() + s4() + '-' + s4() + '-' + s4() + '-' + s4() + '-' + s4() + s4() + s4();
}
