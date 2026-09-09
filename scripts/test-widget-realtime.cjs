const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const { test } = require('node:test');

// Execute the shipped voice functions with fake networking and media objects.
// No browser microphone, recording, API key, or external request is used.
const source = fs.readFileSync(__dirname + '/../public/widget/hotel-chat.js', 'utf8');
const start = source.indexOf('  function startVoiceCall()');
const end = source.indexOf('  function showVoiceOverlay(', start);
assert.ok(start >= 0 && end > start);

function harness({ sdpFails = false, tokenFails = false, microphoneFails = false, microphoneGate = null, sdpGate = null, tokenGate = null } = {}) {
  const calls = [], events = [], alerts = [], status = [];
  let stopped = 0, closed = 0, mediaRequests = 0, removed = 0;
  let channel;
  class PeerConnection {
    constructor() { this.senders = []; }
    addTrack(value) { this.senders.push({ track: value }); }
    createDataChannel(name) {
      assert.equal(name, 'oai-events');
      channel = { send(value) { events.push(JSON.parse(value)); }, close() { this.onclose?.(); } };
      return channel;
    }
    async createOffer() { return { type: 'offer', sdp: 'test-offer' }; }
    async setLocalDescription(offer) { this.localDescription = offer; }
    async setRemoteDescription(answer) { this.remoteDescription = answer; }
    getSenders() { return this.senders; }
    close() { closed++; }
  }
  const context = {
    isVoiceCall: false, isVoiceConnecting: false, voiceCallGeneration: 0,
    voicePc: null, voiceDataChannel: null, voiceAudioEl: null,
    API: 'https://widget.example.test/api/v1/widget/test',
    RTCPeerConnection: PeerConnection,
    document: { createElement(name) { assert.equal(name, 'audio'); return {}; } },
    navigator: { mediaDevices: { async getUserMedia() {
      mediaRequests++;
      if (microphoneFails) throw new Error('Microphone access denied');
      if (microphoneGate && mediaRequests === 1) await microphoneGate;
      const track = { stop() { stopped++; } };
      return { getTracks() { return [track]; } };
    } } },
    async fetch(url, options) {
      calls.push({ url, options });
      if (url.endsWith('/realtime-session')) {
        if (tokenGate && calls.length === 1) await tokenGate;
        return { ok: !tokenFails, status: 502,
          async text() { return JSON.stringify({ error: 'Provider unavailable' }); },
          async json() { return { client_secret: 'test-ephemeral-only', voice: 'alloy', language_name: 'French' }; } };
      }
      assert.equal(url, 'https://api.openai.com/v1/realtime/calls');
      if (sdpGate && calls.filter(call => call.url.endsWith('/calls')).length === 1) await sdpGate;
      return { ok: !sdpFails, async text() { return 'test-answer'; } };
    },
    console: { error() {} }, alert(message) { alerts.push(message); },
    showVoiceOverlay() {}, removeVoiceOverlay() { removed++; },
    updateVoiceCallUI() {}, updateVoiceOverlayStatus(value) { status.push(value); },
    messages: [], renderMessages() {},
  };
  vm.createContext(context);
  vm.runInContext(source.slice(start, end), context);
  return { context, calls, events, alerts, status, get channel() { return channel; },
    stopped: () => stopped, closed: () => closed, mediaRequests: () => mediaRequests, removed: () => removed };
}

test('GA exchange uses session defaults and emits audio plus transcript events', async () => {
  const h = harness();
  await h.context.startVoiceCall();
  assert.equal(h.calls.length, 2);
  const sdp = h.calls[1].options;
  assert.equal(sdp.headers.Authorization, 'Bearer test-ephemeral-only');
  assert.equal(sdp.headers['Content-Type'], 'application/sdp');
  assert.equal(sdp.body, 'test-offer');
  assert.equal(h.context.voicePc.remoteDescription.sdp, 'test-answer');
  h.channel.onopen();
  assert.equal(h.context.isVoiceCall, true);
  assert.deepEqual(h.events[0].response.output_modalities, ['audio']);
  assert.equal(Object.hasOwn(h.events[0].response, 'modalities'), false);
  assert.match(h.events[0].response.instructions, /French/);
  h.channel.onmessage({ data: JSON.stringify({ type: 'response.output_audio_transcript.done', transcript: 'Bonjour' }) });
  h.channel.onmessage({ data: JSON.stringify({ type: 'conversation.item.input_audio_transcription.completed', transcript: 'Hello' }) });
  assert.equal(h.context.messages[0].role, 'assistant');
  assert.equal(h.context.messages[0].content, 'Bonjour');
  assert.equal(h.context.messages[1].role, 'user');
});

test('a rejected SDP exchange closes the peer and releases its mock microphone track', async () => {
  const h = harness({ sdpFails: true });
  await h.context.startVoiceCall();
  assert.equal(h.stopped(), 1);
  assert.equal(h.closed(), 1);
  assert.equal(h.context.voicePc, null);
  assert.equal(h.context.voiceDataChannel, null);
  assert.equal(h.context.isVoiceCall, false);
  assert.match(h.alerts[0], /SDP exchange failed/);
  assert.equal(h.removed(), 1);
});

test('a rejected backend session never requests microphone access', async () => {
  const h = harness({ tokenFails: true });
  await h.context.startVoiceCall();
  assert.equal(h.calls.length, 1);
  assert.equal(h.mediaRequests(), 0);
  assert.match(h.alerts[0], /Provider unavailable/);
});

test('microphone denial closes the peer and never sends an SDP offer', async () => {
  const h = harness({ microphoneFails: true });
  await h.context.startVoiceCall();
  assert.equal(h.calls.length, 1);
  assert.equal(h.closed(), 1);
  assert.equal(h.context.voicePc, null);
  assert.match(h.alerts[0], /Microphone access denied/);
});

function deferred() {
  let resolve, reject;
  const promise = new Promise((done, fail) => { resolve = done; reject = fail; });
  return { promise, resolve, reject };
}

const flush = () => new Promise(resolve => setImmediate(resolve));

test('duplicate starts are ignored and cancellation before token arrival never requests media', async () => {
  const gate = deferred();
  const h = harness({ tokenGate: gate.promise });
  const first = h.context.startVoiceCall();
  await h.context.startVoiceCall();
  assert.equal(h.calls.length, 1);
  h.context.endVoiceCall();
  gate.resolve();
  await first;
  assert.equal(h.mediaRequests(), 0);
  assert.equal(h.context.isVoiceConnecting, false);
  assert.equal(h.alerts.length, 0);
});

test('cancelled pending permission stops its eventual tracks without closing a newer call', async () => {
  const gate = deferred();
  const h = harness({ microphoneGate: gate.promise });
  const first = h.context.startVoiceCall();
  await flush();
  assert.equal(h.mediaRequests(), 1);
  h.context.endVoiceCall();
  await h.context.startVoiceCall();
  const currentPeer = h.context.voicePc;
  h.channel.onopen();
  gate.resolve();
  await first;
  assert.equal(h.stopped(), 1);
  assert.equal(h.closed(), 1);
  assert.equal(h.context.voicePc, currentPeer);
  assert.equal(h.context.isVoiceCall, true);
  assert.equal(h.alerts.length, 0);
});

test('late failure and events from a cancelled SDP attempt cannot terminate the newer connection', async () => {
  const gate = deferred();
  const h = harness({ sdpGate: gate.promise });
  const first = h.context.startVoiceCall();
  await flush();
  const oldChannel = h.channel;
  h.context.endVoiceCall();
  await h.context.startVoiceCall();
  const currentPeer = h.context.voicePc;
  h.channel.onopen();
  gate.reject(new Error('Old exchange failed'));
  await first;
  oldChannel.onclose();
  oldChannel.onmessage({ data: JSON.stringify({ type: 'response.output_audio_transcript.done', transcript: 'Old message' }) });
  assert.equal(h.context.voicePc, currentPeer);
  assert.equal(h.context.isVoiceCall, true);
  assert.equal(h.stopped(), 1);
  assert.equal(h.closed(), 1);
  assert.equal(h.alerts.length, 0);
  assert.equal(h.context.messages.length, 0);
});
