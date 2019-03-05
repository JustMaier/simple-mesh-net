const uuid = () => 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
  var r = Math.random() * 16 | 0,
      v = c == 'x' ? r : r & 0x3 | 0x8;
  return v.toString(16);
});

const raceToSuccess = promises => Promise.all(promises.map(p => {
  // If a request fails, count that as a resolution so it will keep
  // waiting for other possible successes. If a request succeeds,
  // treat it as a rejection so Promise.all immediately bails out.
  return p.then(val => Promise.reject(val), err => Promise.resolve(err));
})).then( // If '.all' resolved, we've just got an array of errors.
errors => Promise.reject(errors), // If '.all' rejected, we've got the result we wanted.
val => Promise.resolve(val));

class LiteEventEmitter {
    constructor(){
        this._handlers = {};
    }

    on(type, handler){
        if(this._handlers[type] == null) this._handlers[type] = []; 
        this._handlers[type].push(handler);
        return this;
    }

    once(type, handler){
		const onceHandler = (...args) => {
			handler(...args);
            this.off(type, onceHandler);
        };
        return this.on(type, onceHandler);
    }

    off(type, handler = null){
        if(handler == null) this._handlers[type] = [];
        else {
            const index = this._handlers[type].indexOf(handler);
            if(index != -1) this._handlers[type].splice(index, 1);
        }
        return this;
    }

    emit(type, ...args) {
        if(!this._handlers[type] || this._handlers[type].length === 0) return;
        this._handlers[type].forEach(handler=>handler(...args));
    }
}

class WrappedWebSocket extends LiteEventEmitter {
  constructor(endpoint) {
    super();
    const socket = new WebSocket(endpoint);

    socket.onmessage = ({
      data
    }) => {
      const {
        type,
        payload
      } = JSON.parse(data);
      this.emit(type, payload);
    };

    socket.onopen = () => this.emit('open', this);

    this.send = (type, payload) => socket.send(JSON.stringify({
      type,
      payload
    }));
  }

}

var isChromium = !!window.chrome || navigator.userAgent.toLowerCase().includes('electron');

var utils = {
	isChromium: isChromium
};

function createError(message, code) {
  const err = new Error(message);
  err.code = code;
  return err;
}

var createError_1 = createError;

function parseOptions(inputOptions) {
  const userOptions = inputOptions || {};
  return {
    dataChannelConfig: userOptions.dataChannelConfig || {},
    isInitiator: userOptions.isInitiator === true,
    isTrickleIceEnabled: userOptions.isTrickleIceEnabled !== false,
    peerConnectionConfig: getPeerConnectionConfig(userOptions),
    sdpTransformer: getSdpTransformer(userOptions),
    streams: getStreams(userOptions)
  };
}

function getPeerConnectionConfig(userOptions) {
  const peerConnectionConfig = userOptions.peerConnectionConfig || {};

  if (!Array.isArray(peerConnectionConfig.iceServers)) {
    peerConnectionConfig.iceServers = [];
  }

  return peerConnectionConfig;
}

function getSdpTransformer(userOptions) {
  return typeof userOptions.sdpTransformer === 'function' ? userOptions.sdpTransformer : sdp => sdp;
}

function getStreams(userOptions) {
  return Array.isArray(userOptions.streams) ? userOptions.streams : [];
}

var parseOptions_1 = parseOptions;

var ADD_ICE_CANDIDATE = 'ERR_ADD_ICE_CANDIDATE';
var CREATE_ANSWER = 'ERR_CREATE_ANSWER';
var CREATE_OFFER = 'ERR_CREATE_OFFER';
var DATA_CHANNEL = 'ERR_DATA_CHANNEL';
var ICE_CONNECTION_CLOSED = 'ERR_ICE_CONNECTION_CLOSED';
var ICE_CONNECTION_FAILURE = 'ERR_ICE_CONNECTION_FAILURE';
var PEER_IS_DESTROYED = 'ERR_PEER_IS_DESTROYED';
var REMOVE_TRACK = 'ERR_REMOVE_TRACK';
var SET_LOCAL_DESCRIPTION = 'ERR_SET_LOCAL_DESCRIPTION';
var SET_REMOTE_DESCRIPTION = 'ERR_SET_REMOTE_DESCRIPTION';
var SIGNALING = 'ERR_SIGNALING';
var WEBRTC_SUPPORT = 'ERR_WEBRTC_SUPPORT';

var errorCodes = {
	ADD_ICE_CANDIDATE: ADD_ICE_CANDIDATE,
	CREATE_ANSWER: CREATE_ANSWER,
	CREATE_OFFER: CREATE_OFFER,
	DATA_CHANNEL: DATA_CHANNEL,
	ICE_CONNECTION_CLOSED: ICE_CONNECTION_CLOSED,
	ICE_CONNECTION_FAILURE: ICE_CONNECTION_FAILURE,
	PEER_IS_DESTROYED: PEER_IS_DESTROYED,
	REMOVE_TRACK: REMOVE_TRACK,
	SET_LOCAL_DESCRIPTION: SET_LOCAL_DESCRIPTION,
	SET_REMOTE_DESCRIPTION: SET_REMOTE_DESCRIPTION,
	SIGNALING: SIGNALING,
	WEBRTC_SUPPORT: WEBRTC_SUPPORT
};

const {
  isChromium: isChromium$1
} = utils;







class WebRTCPeer extends LiteEventEmitter {
  constructor(options) {
    super();
    const self = this;

    self._checkWebRTCSupport();

    self._options = parseOptions_1(options);
    self._isConnected = false;
    self._isDestroyed = false;
    self._isIceComplete = false;
    self._isNegotiating = false;
    self._shouldRenegotiate = false;
    self._peerConnection = null;
    self._dataChannel = null;
    self._remoteStreamIds = new Set();
    self._mediaTracksMap = new Map();

    self._setUpPeerConnection();
  }

  addStream(stream) {
    stream.getTracks().forEach(track => this.addTrack(track, stream));
  }

  addTrack(track, stream) {
    const rtcRtpSender = this._peerConnection.addTrack(track, stream);

    this._mediaTracksMap.set(track, rtcRtpSender);
  }

  destroy(err) {
    const self = this;
    if (self._isDestroyed) return;
    self._isConnected = false;
    self._isDestroyed = true;

    self._removeDataChannelHandlers();

    self._removePeerConnectionHandlers();

    self._dataChannel = null;
    self._peerConnection = null;
    self._mediaTracksMap = null;
    self._remoteStreamIds = null;

    if (err) {
      self.emit('error', err);
    }

    self.emit('close');
  }

  getStats() {
    if (this._isDestroyed) {
      throw createError_1('cannot getStats after peer is destroyed', errorCodes.PEER_IS_DESTROYED);
    }

    return this._peerConnection.getStats();
  }

  isConnected() {
    return this._isConnected;
  }

  isDestroyed() {
    return this._isDestroyed;
  }

  removeStream(stream) {
    stream.getTracks().forEach(track => this.removeTrack(track));
  }

  removeTrack(track) {
    if (!this._mediaTracksMap.has(track)) {
      throw createError_1('cannot remove track that was never added or has already been removed', errorCodes.REMOVE_TRACK);
    }

    const rtcRtpSender = this._mediaTracksMap.get(track);

    this._peerConnection.removeTrack(rtcRtpSender);
  }

  send(data) {
    if (this._isDestroyed) {
      throw createError_1('cannot call send after peer is destroyed', errorCodes.PEER_IS_DESTROYED);
    }

    this._dataChannel.send(data);
  }

  signal(data) {
    const self = this;

    if (self._isDestroyed) {
      throw createError_1('cannot signal after peer is destroyed', errorCodes.SIGNALING);
    }

    let signalData = data;

    if (typeof data === 'string') {
      try {
        signalData = JSON.parse(data);
      } catch (err) {
        signalData = {};
      }
    }

    if (signalData.candidate) {
      self._peerConnection.addIceCandidate(signalData.candidate).catch(onAddIceCandidateError);
    } else if (signalData.sdp) {
      self._setRemoteDescription(signalData);
    } else if (signalData.renegotiate) {
      self._onNegotiationNeeded();
    } else {
      const destroyError = createError_1('signal called with invalid signal data', errorCodes.SIGNALING);
      self.destroy(destroyError);
    }

    function onAddIceCandidateError(err) {
      const destroyError = createError_1(err, errorCodes.ADD_ICE_CANDIDATE);
      self.destroy(destroyError);
    }
  }

  _setRemoteDescription(signalData) {
    const self = this;

    self._peerConnection.setRemoteDescription(signalData).catch(onSetRemoteDescriptionError).then(onSetRemoteDescriptionSuccess);

    function onSetRemoteDescriptionSuccess() {
      if (self._isDestroyed) return;

      if (signalData.type === 'offer') {
        self._createAnswer();
      }
    }

    function onSetRemoteDescriptionError(err) {
      const destroyError = createError_1(err, errorCodes.SET_REMOTE_DESCRIPTION);
      self.destroy(destroyError);
    }
  }

  _setUpPeerConnection() {
    this._peerConnection = new window.RTCPeerConnection(this._options.peerConnectionConfig);

    this._addPeerConnectionHandlers();

    this._setUpDefaultDataChannel();

    this._options.streams.forEach(stream => this.addStream(stream));
  }

  _addPeerConnectionHandlers() {
    const self = this;

    self._peerConnection.onicecandidate = function (event) {
      self._onIceCandidate(event);
    };

    self._peerConnection.oniceconnectionstatechange = function () {
      self._onIceConnectionStateChange();
    };

    self._peerConnection.onicegatheringstatechange = function () {
      self._onIceGatheringStateChange();
    };

    self._peerConnection.onnegotiationneeded = function () {
      self._onNegotiationNeeded();
    };

    self._peerConnection.onsignalingstatechange = function () {
      self._onSignalingStateChange();
    };

    self._peerConnection.ontrack = function (event) {
      self._onTrack(event);
    };
  }

  _setUpDefaultDataChannel() {
    const self = this;

    if (self._options.isInitiator) {
      const label = null;

      const dataChannel = self._peerConnection.createDataChannel(label, self._options.dataChannelConfig);

      self._assignDataChannel({
        channel: dataChannel
      });
    } else {
      self._peerConnection.ondatachannel = function (event) {
        self._assignDataChannel(event);
      };
    }
  }

  _onNegotiationNeeded() {
    if (this._options.isInitiator) {
      if (this._isNegotiating) {
        this._shouldRenegotiate = true;
      } else {
        this._createOffer();
      }
    } else {
      this.emit('signal', {
        renegotiate: true
      });
    }

    this._isNegotiating = true;
  }

  _createAnswer() {
    const self = this;
    if (self._isDestroyed) return;

    self._peerConnection.createAnswer().catch(onCreateAnswerError).then(onCreateAnswerSuccess).catch(onSetLocalDescriptionError).then(onSetLocalDescriptionSuccess);

    function onCreateAnswerSuccess(answer) {
      if (self._isDestroyed) return;
      answer.sdp = self._options.sdpTransformer(answer.sdp);
      return self._peerConnection.setLocalDescription(answer);
    }

    function onSetLocalDescriptionSuccess(offer) {
      if (self._isDestroyed) return;

      if (self._options.isTrickleIceEnabled || self._isIceComplete) {
        emitAnswer();
      } else {
        self.once('_iceComplete', emitAnswer);
      }
    }

    function onCreateAnswerError(err) {
      const destroyError = createError_1(err, errorCodes.CREATE_ANSWER);
      self.destroy(destroyError);
    }

    function onSetLocalDescriptionError(err) {
      const destroyError = createError_1(err, errorCodes.SET_LOCAL_DESCRIPTION);
      self.destroy(destroyError);
    }

    function emitAnswer() {
      self.emit('signal', self._peerConnection.localDescription);
    }
  }

  _onSignalingStateChange() {
    if (this._isDestroyed) return;

    if (this._peerConnection.signalingState === 'stable') {
      this._isNegotiating = false;

      if (this._shouldRenegotiate) {
        this._shouldRenegotiate = false;

        this._onNegotiationNeeded();
      }
    }
  }

  _onTrack(event) {
    const self = this;
    if (self._isDestroyed) return;
    event.streams.forEach(function (eventStream) {
      eventStream.onremovetrack = function (trackEvent) {
        if (self._isDestroyed) return;

        if (!eventStream.active && self._remoteStreamIds.has(eventStream.id)) {
          self._remoteStreamIds.delete(eventStream.id);

          setTimeout(() => {
            self.emit('removestream', eventStream);
          }, 0);
        }

        self.emit('removetrack', trackEvent.track, trackEvent.target);
      };

      setTimeout(function () {
        self.emit('track', event.track, eventStream);
      }, 0);

      const eventHasBeenFired = self._remoteStreamIds.has(eventStream.id);

      if (eventHasBeenFired) return;

      self._remoteStreamIds.add(eventStream.id);

      setTimeout(function () {
        self.emit('stream', eventStream);
      }, 0);
    });
  }

  _onIceCandidate(event) {
    if (this._isDestroyed) return;

    if (event.candidate && this._options.isTrickleIceEnabled) {
      const iceData = {
        candidate: event.candidate
      };
      this.emit('signal', iceData);
    }
  }

  _onIceGatheringStateChange() {
    if (this._isDestroyed) return;
    const iceGatheringState = this._peerConnection.iceGatheringState;

    if (iceGatheringState === 'complete') {
      this._isIceComplete = true;
      this.emit('_iceComplete');
    } else {
      this._isIceComplete = false;
    }
  }

  _onIceConnectionStateChange() {
    const self = this;
    if (self._isDestroyed) return;
    const iceConnectionState = self._peerConnection.iceConnectionState;

    if (iceConnectionState === 'failed') {
      self.destroy(createError_1('Ice connection failed.', errorCodes.ICE_CONNECTION_FAILURE));
    } else if (iceConnectionState === 'closed') {
      self.destroy(createError_1('ice connection closed', errorCodes.ICE_CONNECTION_CLOSED));
    }
  }

  _createOffer() {
    const self = this;
    if (self._isDestroyed) return;

    if (!isChromium$1) {
      self._acceptIncomingVideoAndAudio();
    } // Google Chrome requires offerOptions - see issues.md for further information.


    const offerOptions = !isChromium$1 ? {} : {
      offerToReceiveAudio: true,
      offerToReceiveVideo: true
    };

    self._peerConnection.createOffer(offerOptions).catch(onCreateOfferError).then(onCreateOfferSuccess).catch(onSetLocalDescriptionError).then(onSetLocalDescriptionSuccess);

    function onCreateOfferSuccess(offer) {
      if (self._isDestroyed) return;
      offer.sdp = self._options.sdpTransformer(offer.sdp);
      return self._peerConnection.setLocalDescription(offer);
    }

    function onSetLocalDescriptionSuccess(offer) {
      if (self._isDestroyed) return;

      if (self._options.isTrickleIceEnabled || self._isIceComplete) {
        sendOffer();
      } else {
        self.once('_iceComplete', sendOffer);
      }
    }

    function onCreateOfferError(err) {
      self.destroy(createError_1(err, errorCodes.CREATE_OFFER));
    }

    function onSetLocalDescriptionError(err) {
      self.destroy(createError_1(err, errorCodes.SET_LOCAL_DESCRIPTION));
    }

    function sendOffer() {
      self.emit('signal', self._peerConnection.localDescription);
    }
  }

  _acceptIncomingVideoAndAudio() {
    const audioTransceiver = this._peerConnection.getTransceivers().find(transceiver => transceiver.sender.track && transceiver.sender.track.kind === 'audio');

    const videoTransceiver = this._peerConnection.getTransceivers().find(transceiver => transceiver.sender.track && transceiver.sender.track.kind === 'video');

    if (audioTransceiver == null) {
      this._peerConnection.addTransceiver('audio');
    }

    if (videoTransceiver == null) {
      this._peerConnection.addTransceiver('video');
    }
  }

  _assignDataChannel(event) {
    const self = this;
    self._dataChannel = event.channel;
    self._dataChannel.binaryType = 'arraybuffer';

    self._dataChannel.onclose = function () {
      self._onChannelClose();
    };

    self._dataChannel.onerror = function (errorEvent) {
      const errorMessage = errorEvent.message;
      const errorCode = errorCodes.DATA_CHANNEL;
      const destroyError = createError_1(errorMessage, errorCode);
      self.destroy(destroyError);
    };

    self._dataChannel.onmessage = function (event) {
      self._onChannelMessage(event);
    };

    self._dataChannel.onopen = function () {
      self._onChannelOpen();
    };
  }

  _onChannelOpen() {
    if (this._isConnected || this._isDestroyed) return;
    this._isConnected = true;
    this.emit('connect');
  }

  _onChannelMessage(event) {
    if (!this._isDestroyed) {
      this.emit('data', event.data);
    }
  }

  _onChannelClose() {
    if (!this._isDestroyed) {
      this.destroy();
    }
  }

  _removeDataChannelHandlers() {
    if (this._dataChannel) {
      try {
        this._dataChannel.close();
      } catch (err) {}

      this._dataChannel.onclose = null;
      this._dataChannel.onerror = null;
      this._dataChannel.onmessage = null;
      this._dataChannel.onopen = null;
    }
  }

  _removePeerConnectionHandlers() {
    if (this._peerConnection) {
      try {
        this._peerConnection.close();
      } catch (err) {}

      this._peerConnection.onicecandidate = null;
      this._peerConnection.oniceconnectionstatechange = null;
      this._peerConnection.onicegatheringstatechange = null;
      this._peerConnection.onnegotiationneeded = null;
      this._peerConnection.onsignalingstatechange = null;
      this._peerConnection.ontrack = null;
      this._peerConnection.ondatachannel = null;
    }
  }

  _checkWebRTCSupport() {
    if (typeof window === 'undefined') {
      throw createError_1('WebRTC is not supported in this environment', errorCodes.WEBRTC_SUPPORT);
    }

    if (window.RTCPeerConnection == null) {
      throw createError_1('WebRTC is not supported in this browser', errorCodes.WEBRTC_SUPPORT);
    }

    if (!('createDataChannel' in window.RTCPeerConnection.prototype)) {
      console.log('webrtc-link :: data channel is not supported in this browser');
    }
  }

}

var dist = WebRTCPeer;

const MeshPeerEvents = {
  DATA: 'data'
};
class MeshPeer extends LiteEventEmitter {
  constructor(client, peerName, options) {
    super();
    this.peerName = peerName;
    this._peer = new dist({
      peerConnectionConfig: {
        iceServers: [{
          urls: 'stun:stun.l.google.com:19302'
        }, {
          urls: 'stun:global.stun.twilio.com:3478?transport=udp'
        }]
      },
      ...options
    });

    this._peer.on('error', err => client._peerEvents.error(this, err));

    this._peer.on('close', () => client._peerEvents.close(this));

    this._peer.on('signal', signal => client._peerEvents.signal(this, signal));

    this._peer.on('connect', () => client._peerEvents.connect(this));

    this._peer.on('data', data => {
      const {
        id,
        type,
        payload
      } = JSON.parse(data);
      const req = {
        id,
        peer: this._peer,
        payload
      };
      const res = {
        send: responseData => {
          this._peer.send(JSON.stringify({
            id,
            type: 'response',
            payload: responseData
          }));

          res.send = () => console.warn('Already sent response', id);
        }
      };

      client._peerEvents.data(this, type, req, res);

      this.emit(type, req, res);
    }); // Request handling


    this._requests = {};
    this.on('response', ({
      id,
      payload
    }) => {
      const request = this._requests[id];
      if (!request) return;
      request.resolve(payload);
      clearTimeout(request.timeout);
      delete this._requests[id];
    });
  }

  send(type, payload) {
    const id = uuid();
    return new Promise((resolve, reject) => {
      this._requests[id] = {
        resolve,
        reject,
        timeout: setTimeout(() => reject('Request timed out'), 10000)
      };

      this._peer.send(JSON.stringify({
        id,
        type,
        payload
      }));
    });
  }

}

const MeshClientEvents = {
  PEER_CLOSE: 'peer:close',
  PEER_ERROR: 'peer:error',
  PEER_CONNECT: 'peer:connect',
  PEER_SIGNAL: 'peer:signal'
};
class MeshClient extends LiteEventEmitter {
  constructor(peerName, options = {}) {
    super();
    this.peerName = peerName;
    this.options = {
      signalServer: 'ws://localhost:8080',
      logger: (...args) => console.log(...args),
      ...options
    };
    this.peers = {};
    const signalSocket = new WrappedWebSocket(this.options.signalServer).on('discovered', ({
      peerName
    }) => {
      this.options.logger('discovered', peerName);
      this.peers[peerName] = new MeshPeer(this, peerName, {
        isInitiator: true
      });
    }).on('signal', ({
      peerName,
      signal
    }) => {
      this.options.logger('signal from', peerName);
      const peer = this.peers[peerName] = this.peers[peerName] || new MeshPeer(this, peerName);

      peer._peer.signal(signal);
    }).on('open', () => signalSocket.send('discover', {
      peerName: this.peerName
    }));
    this._peerEvents = {
      error: (peer, err) => this.emit(MeshClientEvents.PEER_ERROR, peer, err),
      close: peer => {
        if (this.peers[peer.peerName]._peer.isDestroyed()) delete this.peers[peer.peerName];
        this.emit(MeshClientEvents.PEER_CLOSE, peer);
      },
      connect: peer => this.emit(MeshClientEvents.PEER_CONNECT, peer),
      data: (peer, type, req, res) => this.emit(type, peer, req, res),
      signal: (peer, signal) => {
        signalSocket.send('signal', {
          peerName: peer.peerName,
          signal
        });
        this.emit(MeshClientEvents.PEER_SIGNAL, peer, signal);
      }
    };
  }

  send(peerName, type, data) {
    return this.peers[peerName].send(type, data);
  }

  broadcast(type, data, filterFn = null) {
    const promises = Object.values(this.peers).filter(x => x._peer.isConnected()).filter(x => filterFn == null || filterFn(x)).map(peer => peer.send(type, data));
    return raceToSuccess(promises);
  }

}

export default MeshClient;
export { MeshPeer, MeshPeerEvents, MeshClientEvents };
