/*
 *  Copyright 2014 The WebRTC Project Authors. All rights reserved.
 *
 *  Use of this source code is governed by a BSD-style license
 *  that can be found in the LICENSE file in the root of the source
 *  tree. An additional intellectual property rights grant can be found
 *  in the file PATENTS.  All contributing project authors may
 *  be found in the AUTHORS file in the root of the source tree.
 */

package org.appspot.apprtc;

import android.os.Handler;
import android.util.Log;
import de.tavendo.autobahn.WebSocket.WebSocketConnectionObserver;
import de.tavendo.autobahn.WebSocketConnection;
import de.tavendo.autobahn.WebSocketException;
import java.net.URI;
import java.net.URISyntaxException;
import java.util.ArrayList;
import java.util.List;
import org.appspot.apprtc.util.AsyncHttpURLConnection;
import org.appspot.apprtc.util.AsyncHttpURLConnection.AsyncHttpEvents;
import org.json.JSONException;
import org.json.JSONObject;

/**
 * WebSocket client implementation.
 *
 * <p>All public methods should be called from a looper executor thread
 * passed in a constructor, otherwise exception will be thrown.
 * All events are dispatched on the same thread.
 */
public class WebSocketChannelClient {
  private static final String TAG = "WSChannelRTCClient";
  private static final int CLOSE_TIMEOUT = 1000;
  private final WebSocketChannelEvents events;
  private final Handler handler;
  private WebSocketConnection ws;
  private String wsServerUrl;
  private String postServerUrl;
  private String roomID;
  private String clientID;
  private WebSocketConnectionState state;
  // Do not remove this member variable. If this is removed, the observer gets garbage collected and
  // this causes test breakages.
  private WebSocketObserver wsObserver;
  private final Object closeEventLock = new Object();
  private boolean closeEvent;
  // WebSocket send queue. Messages are added to the queue when WebSocket
  // client is not registered and are consumed in register() call.
  private final List<String> wsSendQueue = new ArrayList<>();

  /**
   * Possible WebSocket connection states.
   */
  public enum WebSocketConnectionState { NEW, CONNECTED, REGISTERED, CLOSED, ERROR }

  /**
   * Callback interface for messages delivered on WebSocket.
   * All events are dispatched from a looper executor thread.
   */
  public interface WebSocketChannelEvents {
    void onWebSocketMessage(final String message);
    void onWebSocketClose();
    void onWebSocketError(final String description);
  }

  public WebSocketChannelClient(Handler handler, WebSocketChannelEvents events) {
    this.handler = handler;
    this.events = events;
    roomID = null;
    clientID = null;
    state = WebSocketConnectionState.NEW;
  }

  public WebSocketConnectionState getState() {
    return state;
  }

  public void connect(final String wsUrl, final String postUrl) {
    checkIfCalledOnValidThread();
    if (state != WebSocketConnectionState.NEW) {
      Log.e(TAG, "WebSocket is already connected.");
      return;
    }
    wsServerUrl = wsUrl;
    postServerUrl = postUrl;
    closeEvent = false;

    Log.d(TAG, "Connecting WebSocket to: " + wsUrl + ". Post URL: " + postUrl);
    ws = new WebSocketConnection();
    wsObserver = new WebSocketObserver();
    try {
      ws.connect(new URI(wsServerUrl), wsObserver);
    } catch (URISyntaxException e) {
      reportError("URI error: " + e.getMessage());
    } catch (WebSocketException e) {
      reportError("WebSocket connection error: " + e.getMessage());
    }
  }

  public void register(final String roomID, final String clientID) {
    checkIfCalledOnValidThread();
    this.roomID = roomID;
    this.clientID = clientID;
    if (state != WebSocketConnectionState.CONNECTED) {
      Log.w(TAG, "WebSocket register() in state " + state);
      return;
    }
    /*Log.d(TAG, "Registering WebSocket for room " + roomID + ". ClientID: " + clientID);
    JSONObject json = new JSONObject();
    try {
      json.put("cmd", "register");
      json.put("roomid", roomID);
      json.put("clientid", clientID);
      Log.d(TAG, "C->WSS: " + json.toString());
      ws.sendTextMessage(json.toString());
      state = WebSocketConnectionState.REGISTERED;
      // Send any previously accumulated messages.
      for (String sendMessage : wsSendQueue) {
        send(sendMessage);
      }
      wsSendQueue.clear();
    } catch (JSONException e) {
      reportError("WebSocket register JSON error: " + e.getMessage());
    }*/
  }


  public void hello() {
    /*
     var hello = new Object();
      hello.command = "hello";
      hello.name = "SomeBrowser";
      hello.id = uuid;
      serverConnection.send(JSON.stringify(hello));
     */
    checkIfCalledOnValidThread();
    if (state != WebSocketConnectionState.CONNECTED) {
      Log.w(TAG, "WebSocket hello() in state " + state);
      return;
    }
    Log.d(TAG, "Sending hello for ClientID: " + clientID);
    JSONObject json = new JSONObject();
    try {
      json.put("command", "hello");
      json.put("name", "Android");
      json.put("id", clientID);
      Log.d(TAG, "C->WSS: " + json.toString());
      ws.sendTextMessage(json.toString());
      state = WebSocketConnectionState.REGISTERED;
      // Send any previously accumulated messages.
      for (String sendMessage : wsSendQueue) {
        send(sendMessage);
      }
      wsSendQueue.clear();
    } catch (JSONException e) {
      reportError("hello : WebSocket register JSON error: " + e.getMessage());
    }
  }


  public void talk() {
    /*
    var talk = new Object();
    talk.command = "talk";
    talk.alias = camera_name;
    talk.from = uuid;
    serverConnection.send(JSON.stringify(talk));
    console.log("after talk send command");
     */

    checkIfCalledOnValidThread();
    if (state != WebSocketConnectionState.REGISTERED) {
      Log.w(TAG, "WebSocket talk() in state " + state);
      return;
    }
    Log.d(TAG, "Sending talk for ClientID: " + clientID);
    JSONObject json = new JSONObject();
    try {
      json.put("command", "talk");
      json.put("alias", roomID);
      json.put("from", clientID);
      Log.d(TAG, "C->WSS: " + json.toString());
      ws.sendTextMessage(json.toString());
      //state = WebSocketConnectionState.REGISTERED;
      // Send any previously accumulated messages.
      for (String sendMessage : wsSendQueue) {
        send(sendMessage);
      }
      wsSendQueue.clear();
    } catch (JSONException e) {
      reportError("talk : WebSocket register JSON error: " + e.getMessage());
    }
  }


  public void start_now() {
    /*
    var trigger = Object();
    trigger.command = "start_now";
    trigger.from = uuid;
    trigger.alias = camera_name;
    serverConnection.send(JSON.stringify(trigger));
    start_time = new Date();
     */

    checkIfCalledOnValidThread();
    if (state != WebSocketConnectionState.REGISTERED) {
      Log.w(TAG, "WebSocket start_now() in state " + state);
      return;
    }

    Log.d(TAG, "Sending start_now for ClientID: " + clientID);
    JSONObject json = new JSONObject();
    try {
      json.put("command", "start_now");
      json.put("alias", roomID);
      json.put("from", clientID);
      Log.d(TAG, "C->WSS: " + json.toString());
      ws.sendTextMessage(json.toString());
      //state = WebSocketConnectionState.REGISTERED;
      // Send any previously accumulated messages.
      for (String sendMessage : wsSendQueue) {
        send(sendMessage);
      }
      wsSendQueue.clear();
    } catch (JSONException e) {
      reportError("start_now : WebSocket register JSON error: " + e.getMessage());
    }
  }

  public void send(String message) {
    checkIfCalledOnValidThread();
    switch (state) {
      case NEW:
      case CONNECTED:
        // Store outgoing messages and send them after websocket client
        // is registered.
        Log.d(TAG, "WS ACC: " + message);
        wsSendQueue.add(message);
        return;
      case ERROR:
      case CLOSED:
        Log.e(TAG, "WebSocket send() in error or closed state : " + message);
        return;
      case REGISTERED:
        try {
          JSONObject json = new JSONObject();
          json.put("alias", roomID);
          json.put("from", clientID);

          JSONObject sdpobj = new JSONObject(message);
          json.put("sdp", sdpobj);
          message = json.toString();
          Log.d(TAG, "C->WSS 2: " + message);
          ws.sendTextMessage(message);
        } catch (JSONException e) {
          reportError("WebSocket send JSON error: " + e.getMessage());
        }
        break;
    }
  }

  //send answer sdp via websocket
  public void sendAnswerSdp(String message) {
    if (state != WebSocketConnectionState.REGISTERED) {
      Log.w(TAG, "WebSocket sendAnswerSdp() in state " + state);
      return;
    }
    try {
      JSONObject json = new JSONObject();
      json.put("alias", roomID);
      json.put("from", clientID);

      JSONObject sdpobj = new JSONObject(message);
      json.put("sdp", sdpobj);
      message = json.toString();
      Log.d(TAG, "C->WSS answer sdp : " + message);
      ws.sendTextMessage(message);
    } catch (JSONException e) {
      reportError("WebSocket send JSON error: " + e.getMessage());
    }
  }


  //send ice candidate sdp via websocket
  public void sendLocalIceCandidate(String message) {
    if (state != WebSocketConnectionState.REGISTERED) {
      Log.w(TAG, "WebSocket sendLocalIceCandidate() in state " + state);
      return;
    }
    try {
      JSONObject json = new JSONObject();
      json.put("alias", roomID);
      json.put("from", clientID);

      JSONObject sdpobj = new JSONObject(message);
      json.put("ice", sdpobj);
      message = json.toString();
      Log.d(TAG, "C->WSS ice candidate : " + message);
      ws.sendTextMessage(message);
    } catch (JSONException e) {
      reportError("WebSocket send JSON error: " + e.getMessage());
    }
  }


  // This call can be used to send WebSocket messages before WebSocket
  // connection is opened.
  public void post(String message) {
    checkIfCalledOnValidThread();
    sendWSSMessage("POST", message);
  }

  public void disconnect(boolean waitForComplete) {
    checkIfCalledOnValidThread();
    Log.d(TAG, "Disconnect WebSocket. State: " + state);
    if (state == WebSocketConnectionState.REGISTERED) {
      // Send "bye" to WebSocket server.
      send("{\"type\": \"bye\"}");
      state = WebSocketConnectionState.CONNECTED;
      // Send http DELETE to http WebSocket server.
      sendWSSMessage("DELETE", "");
    }
    // Close WebSocket in CONNECTED or ERROR states only.
    if (state == WebSocketConnectionState.CONNECTED || state == WebSocketConnectionState.ERROR) {
      ws.disconnect();
      state = WebSocketConnectionState.CLOSED;

      // Wait for websocket close event to prevent websocket library from
      // sending any pending messages to deleted looper thread.
      if (waitForComplete) {
        synchronized (closeEventLock) {
          while (!closeEvent) {
            try {
              closeEventLock.wait(CLOSE_TIMEOUT);
              break;
            } catch (InterruptedException e) {
              Log.e(TAG, "Wait error: " + e.toString());
            }
          }
        }
      }
    }
    Log.d(TAG, "Disconnecting WebSocket done.");
  }

  private void reportError(final String errorMessage) {
    Log.e(TAG, errorMessage);
    handler.post(new Runnable() {
      @Override
      public void run() {
        if (state != WebSocketConnectionState.ERROR) {
          state = WebSocketConnectionState.ERROR;
          events.onWebSocketError(errorMessage);
        }
      }
    });
  }

  // Asynchronously send POST/DELETE to WebSocket server.
  private void sendWSSMessage(final String method, final String message) {
    String postUrl = postServerUrl + "/" + roomID + "/" + clientID;
    Log.d(TAG, "WS " + method + " : " + postUrl + " : " + message);
    AsyncHttpURLConnection httpConnection =
        new AsyncHttpURLConnection(method, postUrl, message, new AsyncHttpEvents() {
          @Override
          public void onHttpError(String errorMessage) {
            reportError("WS " + method + " error: " + errorMessage);
          }

          @Override
          public void onHttpComplete(String response) {}
        });
    httpConnection.send();
  }

  // Helper method for debugging purposes. Ensures that WebSocket method is
  // called on a looper thread.
  private void checkIfCalledOnValidThread() {
    if (Thread.currentThread() != handler.getLooper().getThread()) {
      throw new IllegalStateException("WebSocket method is not called on valid thread");
    }
  }

  private class WebSocketObserver implements WebSocketConnectionObserver {
    @Override
    public void onOpen() {
      Log.d(TAG, "WebSocket connection opened to: " + wsServerUrl);
      handler.post(new Runnable() {
        @Override
        public void run() {
          state = WebSocketConnectionState.CONNECTED;
          // Check if we have pending register request.
          /*if (roomID != null && clientID != null) {
            register(roomID, clientID);
          }*/
          if (roomID != null && clientID != null) {
            Log.d(TAG, "WebSocketObserver : Calling hello ");
            hello();

            Log.d(TAG, "WebSocketObserver : Calling hello ");
            talk();

            Log.d(TAG, "WebSocketObserver : Calling hello ");
            start_now();
          }
        }
      });
    }

    @Override
    public void onClose(WebSocketCloseNotification code, String reason) {
      Log.d(TAG, "WebSocket connection closed. Code: " + code + ". Reason: " + reason + ". State: "
              + state);
      synchronized (closeEventLock) {
        closeEvent = true;
        closeEventLock.notify();
      }
      handler.post(new Runnable() {
        @Override
        public void run() {
          if (state != WebSocketConnectionState.CLOSED) {
            state = WebSocketConnectionState.CLOSED;
            events.onWebSocketClose();
          }
        }
      });
    }

    @Override
    public void onTextMessage(String payload) {
      Log.d(TAG, "WSS->C: " + payload);
      final String message = payload;
      handler.post(new Runnable() {
        @Override
        public void run() {
          if (state == WebSocketConnectionState.CONNECTED
              || state == WebSocketConnectionState.REGISTERED) {
            events.onWebSocketMessage(message);
          }
        }
      });
    }

    @Override
    public void onRawTextMessage(byte[] payload) {}

    @Override
    public void onBinaryMessage(byte[] payload) {}
  }
}
