import { uuid } from './utility';
import LiteEventEmitter from 'lite-ee';
import WebRTCPeer from 'webrtc-link';

export const MeshPeerEvents = {
    DATA: 'data'
};

export default class MeshPeer extends LiteEventEmitter {
    constructor(client, peerName, options) {
        super();
		this.peerName = peerName;
        this._peer = new WebRTCPeer({
            peerConnectionConfig: {
                iceServers: [
                    { urls: 'stun:stun.l.google.com:19302' },
					{ urls: 'stun:global.stun.twilio.com:3478?transport=udp' }
                ]
            },
            ...options
        });

        this._peer.on('error', (err) => client._peerEvents.error(this, err));
        this._peer.on('close', () => client._peerEvents.close(this));
        this._peer.on('signal', signal => client._peerEvents.signal(this, signal));
        this._peer.on('connect', () => client._peerEvents.connect(this));

        this._peer.on('data', (data) => {
            const { id, type, payload } = JSON.parse(data);
            const req = { id, peer: this._peer, payload };
            const res = { send: (responseData) => {
                this._peer.send(JSON.stringify({ id, type: 'response', payload: responseData }));
                res.send = () => console.warn('Already sent response', id);
            }};

            client._peerEvents.data(this, type, req, res);
            this.emit(type, req, res);
        });

        // Request handling
        this._requests = {};
        this.on('response', ({id, payload}) => {
            const request = this._requests[id];
            if(!request) return;

            request.resolve(payload);
            clearTimeout(request.timeout);
            delete this._requests[id];
		});

		// PubSub
		this.subscriptions = [];
    }

    send(type, payload, timeout = 10000) {
        const id = uuid();
        return new Promise((resolve, reject) => {
            this._requests[id] = {
                resolve, reject,
                timeout: setTimeout(() => reject('Request timed out'), timeout)
            };

            this._peer.send(JSON.stringify({ id, type, payload }));
        })
    }
}
