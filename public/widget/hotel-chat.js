/**
 * Hotel Tech — Embeddable AI Chat Widget
 * Drop-in chat widget with voice support for hotel websites.
 *
 * Usage: Set window.HotelChat = { key, api } before loading this script.
 * The embed code from the admin panel does this automatically.
 */
(function () {
  'use strict';

  var cfg = window.HotelChat || {};
  if (!cfg.key || !cfg.api) { console.warn('HotelChat: missing key or api'); return; }

  var API = cfg.api;
  // Restore prior session so a page refresh / re-open rehydrates the chat
  // history instead of showing a blank panel. Keyed by widget api so two
  // widgets on one domain don't stomp on each other.
  var STORAGE_KEY = 'htchat_session_' + (cfg.key || 'default');
  var sessionId = null;
  try {
    var stored = localStorage.getItem(STORAGE_KEY);
    if (stored) sessionId = stored;
  } catch (e) {}
  var messages = [];
  var widgetConfig = null;
  // Tracks the highest chat_messages.id we've already rendered, so the poll
  // endpoint only sends us new agent/system replies. Lives across the panel
  // open/close lifecycle so reopening doesn't replay everything.
  var lastMessageId = 0;
  var pollTimer = null;
  var POLL_INTERVAL_MS = 3500;
  var activeAgent = null; // {name, avatar} when a human takes over
  var agentTyping = false;
  var lastTypingPingAt = 0;
  var ratingPrompted = false;
  var ratingSubmitted = false;
  // Localized fallback strings for widget chrome. The admin can still override
  // every label via widget config (input_placeholder, welcome_title, etc.) —
  // these only apply when the override is empty. Detected from browser locale.
  var I18N = {
    en: { placeholder: 'Type a message…', hint: 'Press Enter to send', welcome: 'Hi! How can I help you today?', subtitle: 'Ask about reservations, loyalty program, hotel services, or anything else.', consentTitle: 'Privacy Consent', consentBtn: 'I agree, start chat', consentText: 'By chatting with us you agree to our privacy policy and the storage of your messages.', branding: 'Powered by Hotel AI', offline: "We're currently offline. Leave a message and we'll get back to you.", uploadFailed: 'Upload failed', tooLarge: 'File too large (max 8MB)', somethingWrong: 'Sorry, something went wrong. Please try again.', notified: 'A team member has been notified and will reply shortly.', ratingHow: 'How was this conversation?', thanksRating: 'Thanks for your feedback!' },
    es: { placeholder: 'Escribe un mensaje…', hint: 'Pulsa Enter para enviar', welcome: '¡Hola! ¿En qué puedo ayudarte?', subtitle: 'Pregunta sobre reservas, programa de fidelidad o servicios del hotel.', consentTitle: 'Consentimiento', consentBtn: 'Acepto, iniciar chat', consentText: 'Al chatear con nosotros aceptas nuestra política de privacidad y el almacenamiento de tus mensajes.', branding: 'Con tecnología Hotel AI', offline: 'Actualmente estamos offline. Deja un mensaje y te responderemos.', uploadFailed: 'Error al subir', tooLarge: 'Archivo demasiado grande (máx 8MB)', somethingWrong: 'Lo siento, algo salió mal. Inténtalo de nuevo.', notified: 'Un miembro del equipo ha sido notificado y responderá en breve.', ratingHow: '¿Cómo fue esta conversación?', thanksRating: '¡Gracias por tus comentarios!' },
    fr: { placeholder: 'Tapez un message…', hint: 'Appuyez sur Entrée pour envoyer', welcome: 'Bonjour ! Comment puis-je vous aider ?', subtitle: 'Posez vos questions sur les réservations, le programme de fidélité ou les services.', consentTitle: 'Consentement', consentBtn: "J'accepte, démarrer le chat", consentText: 'En discutant avec nous, vous acceptez notre politique de confidentialité et le stockage de vos messages.', branding: 'Propulsé par Hotel AI', offline: 'Nous sommes actuellement hors ligne. Laissez un message et nous vous répondrons.', uploadFailed: 'Échec de l\'envoi', tooLarge: 'Fichier trop volumineux (max 8 Mo)', somethingWrong: 'Désolé, une erreur est survenue. Veuillez réessayer.', notified: 'Un membre de l\'équipe a été notifié et répondra bientôt.', ratingHow: 'Comment s\'est passée cette conversation ?', thanksRating: 'Merci pour vos commentaires !' },
    de: { placeholder: 'Nachricht schreiben…', hint: 'Eingabetaste zum Senden', welcome: 'Hallo! Wie kann ich helfen?', subtitle: 'Fragen Sie zu Reservierungen, Treueprogramm oder Hotelservices.', consentTitle: 'Datenschutz', consentBtn: 'Einverstanden, Chat starten', consentText: 'Durch das Chatten mit uns stimmen Sie unserer Datenschutzerklärung und der Speicherung Ihrer Nachrichten zu.', branding: 'Bereitgestellt von Hotel AI', offline: 'Wir sind gerade offline. Hinterlassen Sie eine Nachricht und wir melden uns.', uploadFailed: 'Upload fehlgeschlagen', tooLarge: 'Datei zu groß (max. 8 MB)', somethingWrong: 'Etwas ist schiefgelaufen. Bitte erneut versuchen.', notified: 'Ein Teammitglied wurde benachrichtigt und antwortet in Kürze.', ratingHow: 'Wie war diese Unterhaltung?', thanksRating: 'Danke für Ihr Feedback!' },
    it: { placeholder: 'Scrivi un messaggio…', hint: 'Premi Invio per inviare', welcome: 'Ciao! Come posso aiutarti?', subtitle: 'Chiedi informazioni su prenotazioni, programma fedeltà o servizi.', consentTitle: 'Privacy', consentBtn: 'Accetto, inizia chat', consentText: 'Chattando con noi accetti la nostra privacy policy e la conservazione dei messaggi.', branding: 'Realizzato con Hotel AI', offline: 'Al momento siamo offline. Lascia un messaggio e ti risponderemo.', uploadFailed: 'Caricamento fallito', tooLarge: 'File troppo grande (max 8 MB)', somethingWrong: 'Qualcosa è andato storto. Riprova.', notified: 'Un membro del team è stato avvisato e risponderà a breve.', ratingHow: "Com'è andata questa conversazione?", thanksRating: 'Grazie per il tuo feedback!' },
    pt: { placeholder: 'Escreva uma mensagem…', hint: 'Pressione Enter para enviar', welcome: 'Olá! Como posso ajudar?', subtitle: 'Pergunte sobre reservas, programa de fidelidade ou serviços do hotel.', consentTitle: 'Privacidade', consentBtn: 'Concordo, iniciar chat', consentText: 'Ao conversar conosco você aceita nossa política de privacidade e o armazenamento das suas mensagens.', branding: 'Desenvolvido por Hotel AI', offline: 'Estamos offline no momento. Deixe uma mensagem e retornaremos.', uploadFailed: 'Falha no upload', tooLarge: 'Arquivo muito grande (máx 8MB)', somethingWrong: 'Algo deu errado. Tente novamente.', notified: 'Um membro da equipe foi notificado e responderá em breve.', ratingHow: 'Como foi esta conversa?', thanksRating: 'Obrigado pelo feedback!' },
    ru: { placeholder: 'Введите сообщение…', hint: 'Нажмите Enter для отправки', welcome: 'Здравствуйте! Чем могу помочь?', subtitle: 'Спрашивайте о бронировании, программе лояльности или услугах отеля.', consentTitle: 'Согласие', consentBtn: 'Согласен, начать чат', consentText: 'Общаясь с нами, вы соглашаетесь с нашей политикой конфиденциальности и хранением ваших сообщений.', branding: 'Работает на Hotel AI', offline: 'Сейчас мы офлайн. Оставьте сообщение, и мы ответим.', uploadFailed: 'Ошибка загрузки', tooLarge: 'Файл слишком большой (макс 8 МБ)', somethingWrong: 'Что-то пошло не так. Попробуйте ещё раз.', notified: 'Сотрудник был уведомлён и скоро ответит.', ratingHow: 'Как прошёл разговор?', thanksRating: 'Спасибо за отзыв!' }
  };
  function detectLang() {
    var l = (window.HotelChatConfig && window.HotelChatConfig.lang) || navigator.language || 'en';
    l = String(l).toLowerCase().slice(0, 2);
    return I18N[l] ? l : 'en';
  }
  var T = I18N[detectLang()];
  // GDPR consent: when widgetConfig.gdpr_consent_required is true, the visitor
  // must tick a consent box once before any message is sent. Persisted in
  // localStorage so they don't have to re-consent on every page load.
  var gdprAccepted = false;
  try { gdprAccepted = localStorage.getItem('htchat_gdpr_ok') === '1'; } catch (e) {}

  // ── Feature detection ──
  var SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  var hasSTT = !!SpeechRecognition;
  var hasTTS = 'speechSynthesis' in window;

  // ── State ──
  var isOpen = false;
  var isLoading = false;
  var isListening = false;
  var isSpeaking = false;
  var ttsEnabled = false;
  var recognition = null;
  var lastUserLang = (navigator.language || 'en-US');
  var isVoiceCall = false;
  var voicePc = null; // WebRTC PeerConnection
  var voiceDataChannel = null;
  var voiceAudioEl = null;

  // ── Styles ──
  var STYLES = '\
    #htchat-widget * { box-sizing: border-box; margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; }\
    #htchat-launcher { position: fixed; z-index: 99998; width: 56px; height: 56px; border-radius: 50%; border: none; cursor: pointer; display: flex; align-items: center; justify-content: center; box-shadow: 0 4px 20px rgba(0,0,0,0.25); transition: transform 0.2s, box-shadow 0.2s; }\
    #htchat-launcher:hover { transform: scale(1.08); box-shadow: 0 6px 28px rgba(0,0,0,0.35); }\
    #htchat-launcher svg { width: 24px; height: 24px; fill: white; }\
    #htchat-launcher .htchat-pulse { position: absolute; top: -2px; right: -2px; width: 12px; height: 12px; background: #22c55e; border-radius: 50%; border: 2px solid white; }\
    #htchat-panel { position: fixed; z-index: 99999; width: 380px; height: 560px; border-radius: 16px; overflow: hidden; display: flex; flex-direction: column; box-shadow: 0 20px 60px rgba(0,0,0,0.3); transition: opacity 0.25s, transform 0.25s; background: #fff; }\
    #htchat-panel.hidden { opacity: 0; transform: translateY(20px) scale(0.95); pointer-events: none; }\
    #htchat-header { padding: 14px 16px; display: flex; align-items: center; justify-content: space-between; color: white; flex-shrink: 0; }\
    #htchat-header-left { display: flex; align-items: center; gap: 10px; }\
    #htchat-header-avatar { width: 36px; height: 36px; border-radius: 10px; background: rgba(255,255,255,0.2); display: flex; align-items: center; justify-content: center; }\
    #htchat-header-avatar svg { width: 18px; height: 18px; fill: white; }\
    #htchat-header-info h3 { font-size: 14px; font-weight: 600; }\
    #htchat-header-info p { font-size: 11px; opacity: 0.8; }\
    #htchat-header-actions { display: flex; gap: 6px; align-items: center; }\
    #htchat-header-actions button { background: rgba(255,255,255,0.15); border: none; color: white; width: 28px; height: 28px; border-radius: 8px; cursor: pointer; display: flex; align-items: center; justify-content: center; transition: background 0.2s; }\
    #htchat-header-actions button:hover { background: rgba(255,255,255,0.25); }\
    #htchat-header-actions button.active { background: rgba(255,255,255,0.3); }\
    #htchat-header-actions button svg { width: 14px; height: 14px; fill: currentColor; }\
    #htchat-messages { flex: 1; overflow-y: auto; padding: 16px; background: #f9fafb; }\
    .htchat-msg { margin-bottom: 12px; display: flex; gap: 8px; }\
    .htchat-msg.user { justify-content: flex-end; }\
    .htchat-msg-bubble { max-width: 80%; padding: 10px 14px; border-radius: 16px; font-size: 13px; line-height: 1.5; word-wrap: break-word; }\
    .htchat-msg.assistant .htchat-msg-bubble { background: white; color: #1f2937; border: 1px solid #e5e7eb; border-bottom-left-radius: 4px; }\
    .htchat-msg.user .htchat-msg-bubble { color: white; border-bottom-right-radius: 4px; }\
    .htchat-msg-bubble strong { font-weight: 600; }\
    .htchat-welcome { text-align: center; padding: 30px 20px; }\
    .htchat-welcome-icon { width: 52px; height: 52px; border-radius: 16px; margin: 0 auto 12px; display: flex; align-items: center; justify-content: center; }\
    .htchat-welcome-icon svg { width: 26px; height: 26px; }\
    .htchat-welcome h3 { font-size: 16px; font-weight: 600; color: #1f2937; margin-bottom: 6px; }\
    .htchat-welcome p { font-size: 12px; color: #6b7280; max-width: 260px; margin: 0 auto; }\
    .htchat-suggestions { display: flex; flex-direction: column; gap: 6px; margin-top: 16px; }\
    .htchat-suggestion { background: white; border: 1px solid #e5e7eb; border-radius: 10px; padding: 8px 12px; font-size: 12px; color: #4b5563; text-align: left; cursor: pointer; transition: all 0.15s; }\
    .htchat-suggestion:hover { border-color: currentColor; color: #1f2937; transform: translateY(-1px); box-shadow: 0 2px 8px rgba(0,0,0,0.06); }\
    #htchat-input-area { padding: 12px; border-top: 1px solid #e5e7eb; background: white; flex-shrink: 0; }\
    #htchat-input-row { display: flex; gap: 8px; align-items: flex-end; }\
    #htchat-input { flex: 1; border: 1px solid #e5e7eb; border-radius: 12px; padding: 10px 14px; font-size: 13px; resize: none; outline: none; min-height: 40px; max-height: 80px; transition: border-color 0.2s; }\
    #htchat-input:focus { border-color: currentColor; }\
    #htchat-input::placeholder { color: #9ca3af; }\
    #htchat-send-btn, #htchat-mic-btn { width: 38px; height: 38px; border-radius: 10px; border: none; cursor: pointer; display: flex; align-items: center; justify-content: center; transition: all 0.2s; flex-shrink: 0; }\
    #htchat-send-btn { color: white; }\
    #htchat-send-btn:disabled { opacity: 0.4; cursor: default; }\
    #htchat-send-btn svg, #htchat-mic-btn svg { width: 16px; height: 16px; fill: currentColor; }\
    #htchat-mic-btn { background: #f3f4f6; color: #6b7280; border: 1px solid #e5e7eb; }\
    #htchat-mic-btn:hover { color: #1f2937; border-color: #d1d5db; }\
    #htchat-mic-btn.recording { background: #ef4444; color: white; border-color: #ef4444; animation: htchat-pulse-mic 1.5s ease-in-out infinite; }\
    @keyframes htchat-pulse-mic { 0%, 100% { box-shadow: 0 0 0 0 rgba(239,68,68,0.4); } 50% { box-shadow: 0 0 0 8px rgba(239,68,68,0); } }\
    #htchat-input-hint { font-size: 10px; color: #9ca3af; margin-top: 4px; padding: 0 4px; display: flex; justify-content: space-between; }\
    #htchat-input-hint .recording-hint { color: #ef4444; display: flex; align-items: center; gap: 4px; }\
    #htchat-input-hint .recording-dot { width: 6px; height: 6px; background: #ef4444; border-radius: 50%; animation: htchat-pulse-mic 1s ease-in-out infinite; }\
    .htchat-typing { display: flex; gap: 4px; padding: 4px 0; }\
    .htchat-typing span { width: 6px; height: 6px; border-radius: 50%; animation: htchat-bounce 1.4s ease-in-out infinite; }\
    .htchat-typing span:nth-child(2) { animation-delay: 0.2s; }\
    .htchat-typing span:nth-child(3) { animation-delay: 0.4s; }\
    @keyframes htchat-bounce { 0%, 60%, 100% { transform: translateY(0); } 30% { transform: translateY(-6px); } }\
    #htchat-header-actions #htchat-voice-call-btn { background: #22c55e; color: white; border: none; width: 52px; height: 52px; border-radius: 14px; cursor: pointer; display: flex; align-items: center; justify-content: center; transition: all 0.2s; flex-shrink: 0; box-shadow: 0 4px 14px rgba(34,197,94,0.45), 0 0 0 2px rgba(255,255,255,0.15) inset; position: relative; }\
    #htchat-header-actions #htchat-voice-call-btn:hover { background: #16a34a; transform: translateY(-1px); box-shadow: 0 6px 18px rgba(34,197,94,0.55), 0 0 0 2px rgba(255,255,255,0.2) inset; }\
    #htchat-header-actions #htchat-voice-call-btn::after { content: ""; position: absolute; inset: -4px; border-radius: 16px; border: 2px solid rgba(34,197,94,0.45); animation: htchat-call-ring 2s ease-in-out infinite; pointer-events: none; }\
    #htchat-header-actions #htchat-voice-call-btn.active { background: #ef4444; animation: htchat-pulse-mic 1.5s ease-in-out infinite; box-shadow: 0 4px 14px rgba(239,68,68,0.55), 0 0 0 2px rgba(255,255,255,0.15) inset; }\
    #htchat-header-actions #htchat-voice-call-btn.active::after { border-color: rgba(239,68,68,0.5); }\
    #htchat-header-actions #htchat-voice-call-btn svg { width: 22px; height: 22px; fill: none; stroke: currentColor; stroke-width: 2.2; }\
    @keyframes htchat-call-ring { 0% { transform: scale(1); opacity: 0.9; } 100% { transform: scale(1.25); opacity: 0; } }\
    #htchat-voice-overlay { position: absolute; inset: 0; background: rgba(0,0,0,0.85); display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 16px; z-index: 10; border-radius: 16px; }\
    #htchat-voice-overlay .voice-wave { width: 80px; height: 80px; border-radius: 50%; display: flex; align-items: center; justify-content: center; position: relative; }\
    #htchat-voice-overlay .voice-wave::before { content: ""; position: absolute; inset: -8px; border-radius: 50%; border: 2px solid rgba(255,255,255,0.2); animation: htchat-voice-ring 2s ease-in-out infinite; }\
    #htchat-voice-overlay .voice-wave::after { content: ""; position: absolute; inset: -20px; border-radius: 50%; border: 2px solid rgba(255,255,255,0.1); animation: htchat-voice-ring 2s ease-in-out infinite 0.5s; }\
    #htchat-voice-overlay .voice-wave svg { width: 32px; height: 32px; fill: none; stroke: white; stroke-width: 2; }\
    #htchat-voice-overlay p { color: white; font-size: 14px; font-weight: 500; }\
    #htchat-voice-overlay .voice-status { color: rgba(255,255,255,0.6); font-size: 12px; }\
    #htchat-voice-overlay .end-call-btn { background: #ef4444; color: white; border: none; padding: 12px 28px; border-radius: 24px; font-size: 14px; font-weight: 600; cursor: pointer; display: flex; align-items: center; gap: 8px; margin-top: 8px; transition: background 0.2s; }\
    #htchat-voice-overlay .end-call-btn:hover { background: #dc2626; }\
    #htchat-voice-overlay .end-call-btn svg { width: 16px; height: 16px; fill: none; stroke: currentColor; stroke-width: 2; }\
    @keyframes htchat-voice-ring { 0% { transform: scale(1); opacity: 1; } 100% { transform: scale(1.4); opacity: 0; } }\
    @media (max-width: 600px) {\
      #htchat-panel { width: 100vw !important; height: 100% !important; height: 100dvh !important; max-height: 100dvh !important; right: 0 !important; left: 0 !important; bottom: 0 !important; top: 0 !important; border-radius: 0 !important; }\
      #htchat-launcher { bottom: 16px !important; }\
      #htchat-header { padding-top: max(14px, env(safe-area-inset-top)); padding-left: max(16px, env(safe-area-inset-left)); padding-right: max(16px, env(safe-area-inset-right)); }\
      #htchat-input-area { padding-bottom: max(12px, env(safe-area-inset-bottom)); padding-left: max(12px, env(safe-area-inset-left)); padding-right: max(12px, env(safe-area-inset-right)); }\
      #htchat-input { font-size: 16px; }\
    }\
  ';

  // ── SVG Icons ──
  var ICONS = {
    chat: '<svg viewBox="0 0 24 24"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>',
    message: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>',
    support: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 18.72a9.094 9.094 0 0 0 3.741-.479 3 3 0 0 0-4.682-2.72m.94 3.198.001.031c0 .225-.012.447-.037.666A11.944 11.944 0 0 1 12 21c-2.17 0-4.207-.576-5.963-1.584A6.062 6.062 0 0 1 6 18.719m12 0a5.971 5.971 0 0 0-.941-3.197m0 0A5.995 5.995 0 0 0 12 12.75a5.995 5.995 0 0 0-5.058 2.772m0 0a3 3 0 0 0-4.681 2.72 8.986 8.986 0 0 0 3.74.477m.94-3.197a5.971 5.971 0 0 0-.94 3.197M15 6.75a3 3 0 1 1-6 0 3 3 0 0 1 6 0zm6 3a2.25 2.25 0 1 1-4.5 0 2.25 2.25 0 0 1 4.5 0zm-13.5 0a2.25 2.25 0 1 1-4.5 0 2.25 2.25 0 0 1 4.5 0z"/></svg>',
    question: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>',
    sales: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>',
    quote: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M14.017 21v-7.391c0-5.704 3.731-9.57 8.983-10.609l.995 2.151c-2.432.917-3.995 3.638-3.995 5.849h4v10h-9.983zm-14.017 0v-7.391c0-5.704 3.748-9.57 9-10.609l.996 2.151c-2.433.917-3.996 3.638-3.996 5.849h3.983v10h-9.983z"/></svg>',
    close: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>',
    send: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>',
    mic: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/></svg>',
    micOff: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="1" y1="1" x2="23" y2="23"/><path d="M9 9v3a3 3 0 0 0 5.12 2.12M15 9.34V4a3 3 0 0 0-5.94-.6"/><path d="M17 16.95A7 7 0 0 1 5 12v-2m14 0v2c0 .76-.12 1.49-.34 2.18"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/></svg>',
    volume: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"/></svg>',
    volumeOff: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><line x1="23" y1="9" x2="17" y2="15"/><line x1="17" y1="9" x2="23" y2="15"/></svg>',
    sparkles: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 3l1.91 5.63L20 10.5l-4.69 3.19L16.82 20 12 16.5 7.18 20l1.51-6.31L4 10.5l6.09-1.87z"/></svg>',
    phone: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/></svg>',
    phoneOff: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10.68 13.31a16 16 0 0 0 3.41 2.6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91"/><line x1="1" y1="1" x2="23" y2="23"/></svg>',
  };

  // ── Init ──
  function init() {
    injectStyles();
    createLauncher();
    createPanel();
    loadConfig();
    startVisitorTracking();
  }

  // ── Visitor tracking ──
  // Sends heartbeat every 60s so admin sees online/offline status, and a
  // page-view ping on initial load + each pushState/popstate so the admin
  // visitor detail panel can show the visitor's navigation path.
  function getVisitorCookie() {
    var name = 'htchat_vid=';
    var parts = document.cookie.split(';');
    for (var i = 0; i < parts.length; i++) {
      var c = parts[i].trim();
      if (c.indexOf(name) === 0) return c.substring(name.length);
    }
    var id = 'v_' + Date.now() + '_' + Math.random().toString(36).slice(2, 10);
    document.cookie = name + id + ';path=/;max-age=' + (60 * 60 * 24 * 365);
    return id;
  }

  function trackHeartbeat() {
    fetch(API + '/heartbeat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ visitor_cookie: getVisitorCookie() }),
    }).catch(function () {});
  }

  function trackPageView() {
    fetch(API + '/page-view', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        visitor_cookie: getVisitorCookie(),
        url: location.href,
        title: document.title,
        referrer: document.referrer || null,
      }),
    }).catch(function () {});
  }

  function startVisitorTracking() {
    trackPageView();
    trackHeartbeat();
    setInterval(trackHeartbeat, 60000);
    // Hook SPA navigation
    var lastUrl = location.href;
    var checkUrl = function () {
      if (location.href !== lastUrl) { lastUrl = location.href; trackPageView(); }
    };
    window.addEventListener('popstate', checkUrl);
    var origPush = history.pushState;
    history.pushState = function () { origPush.apply(this, arguments); setTimeout(checkUrl, 0); };
  }

  function injectStyles() {
    var style = document.createElement('style');
    style.textContent = STYLES;
    document.head.appendChild(style);
  }

  function getColor() {
    return (widgetConfig && widgetConfig.primary_color) || cfg.color || '#c9a84c';
  }

  function getPosition() {
    var pos = (widgetConfig && widgetConfig.position) || 'bottom-right';
    return pos === 'bottom-left'
      ? { bottom: '20px', left: '20px', right: 'auto' }
      : { bottom: '20px', right: '20px', left: 'auto' };
  }

  // ── Launcher ──
  function createLauncher() {
    var btn = document.createElement('button');
    btn.id = 'htchat-launcher';
    btn.innerHTML = ICONS.chat + '<span class="htchat-pulse"></span>';
    btn.onclick = togglePanel;
    document.body.appendChild(btn);
    applyPosition(btn);
  }

  function applyPosition(el) {
    var pos = getPosition();
    el.style.bottom = pos.bottom;
    el.style.left = pos.left;
    el.style.right = pos.right;
  }

  function applyColor() {
    var color = getColor();
    var c = widgetConfig || {};
    var launcher = document.getElementById('htchat-launcher');
    if (launcher) {
      launcher.style.background = color;
      // Launcher size
      var sz = (c.launcher_size || 56) + 'px';
      launcher.style.width = sz;
      launcher.style.height = sz;
      // Launcher shape
      var shape = c.launcher_shape || 'circle';
      launcher.style.borderRadius = shape === 'circle' ? '50%'
        : shape === 'pill' ? (c.launcher_size || 56) / 2 + 'px'
        : shape === 'rounded-square' ? '16px' : '8px';
      // Launcher icon
      var iconName = c.launcher_icon || 'chat';
      if (ICONS[iconName]) {
        var pulse = launcher.querySelector('.htchat-pulse');
        launcher.innerHTML = ICONS[iconName] + (pulse ? pulse.outerHTML : '<span class="htchat-pulse"></span>');
      }
    }
    var header = document.getElementById('htchat-header');
    if (header) {
      if (c.header_style === 'gradient' && c.header_gradient_end) {
        header.style.background = 'linear-gradient(135deg, ' + color + ', ' + c.header_gradient_end + ')';
      } else {
        header.style.background = color;
      }
      header.style.color = c.header_text_color || '#ffffff';
    }
    var panel = document.getElementById('htchat-panel');
    if (panel) {
      panel.style.borderRadius = (c.border_radius ?? 16) + 'px';
      if (c.chat_bg_color) panel.style.background = c.chat_bg_color;
    }
    var msgs = document.getElementById('htchat-messages');
    if (msgs && c.chat_bg_color) msgs.style.background = c.chat_bg_color;
    var sendBtn = document.getElementById('htchat-send-btn');
    if (sendBtn) sendBtn.style.background = color;
    var inputArea = document.getElementById('htchat-input-area');
    if (inputArea && c.chat_bg_color) inputArea.style.background = c.chat_bg_color;
    // Apply configurable copy
    var headerInfo = document.getElementById('htchat-header-info');
    if (headerInfo) {
      var ht = c.header_title || 'AI Assistant';
      var hs = c.header_subtitle || 'Ask me anything';
      var statusVal = (c.agent_status || 'online');
      var statusColor = statusVal === 'online' ? '#10b981' : statusVal === 'away' ? '#f59e0b' : '#9ca3af';
      var statusLabel = statusVal === 'online' ? 'Online' : statusVal === 'away' ? 'Away' : 'Offline';
      headerInfo.innerHTML = '<h3>' + escapeHtml(ht) + '</h3>' +
        '<p><span class="htchat-status-dot" style="display:inline-block;width:7px;height:7px;border-radius:50%;background:' + statusColor + ';margin-right:5px;vertical-align:middle"></span>' +
        escapeHtml(hs || statusLabel) + '</p>';
    }
    // Configurable assistant avatar in header
    var headerAvatar = document.getElementById('htchat-header-avatar');
    if (headerAvatar) {
      if (c.assistant_avatar) {
        headerAvatar.innerHTML = '<img src="' + escapeHtml(c.assistant_avatar) + '" alt="" style="width:100%;height:100%;border-radius:50%;object-fit:cover" />';
      } else {
        headerAvatar.innerHTML = ICONS.sparkles;
      }
    }
    var inputEl2 = document.getElementById('htchat-input');
    if (inputEl2 && c.input_placeholder) inputEl2.placeholder = c.input_placeholder;
    // Configurable input hint
    var hintEl = document.getElementById('htchat-input-hint');
    if (hintEl && !isListening) {
      hintEl.innerHTML = '<span>' + escapeHtml(c.input_hint_text || T.hint) + '</span>';
    }
    // Branding
    var branding = document.getElementById('htchat-branding');
    if (branding) {
      if (c.show_branding === false) {
        branding.style.display = 'none';
      } else {
        branding.style.display = '';
        branding.innerHTML = escapeHtml(c.branding_text || T.branding);
      }
    }
    // Font family
    if (c.font_family && c.font_family !== 'system-ui') {
      var fontLink = document.getElementById('htchat-font');
      if (!fontLink) {
        fontLink = document.createElement('link');
        fontLink.id = 'htchat-font';
        fontLink.rel = 'stylesheet';
        document.head.appendChild(fontLink);
      }
      fontLink.href = 'https://fonts.googleapis.com/css2?family=' + encodeURIComponent(c.font_family) + ':wght@400;500;600&display=swap';
      var root = document.getElementById('htchat-widget');
      if (root) root.style.fontFamily = "'" + c.font_family + "', system-ui, sans-serif";
    }
  }

  function applyBubbleStyles() {
    var c = widgetConfig || {};
    document.querySelectorAll('.htchat-msg-bot .htchat-msg-bubble').forEach(function (el) {
      el.style.background = c.bot_bubble_color || '#f3f4f6';
      el.style.color = c.bot_bubble_text || '#1f2937';
    });
    document.querySelectorAll('.htchat-msg-user .htchat-msg-bubble').forEach(function (el) {
      el.style.background = c.user_bubble_color || c.primary_color || '#c9a84c';
      el.style.color = c.user_bubble_text || '#ffffff';
    });
  }

  // ── Panel ──
  function createPanel() {
    var panel = document.createElement('div');
    panel.id = 'htchat-panel';
    panel.className = 'hidden';

    // Position
    var pos = getPosition();
    panel.style.bottom = '86px';
    panel.style.left = pos.left === 'auto' ? 'auto' : pos.left;
    panel.style.right = pos.right === 'auto' ? 'auto' : pos.right;

    panel.innerHTML = '\
      <div id="htchat-header">\
        <div id="htchat-header-left">\
          <div id="htchat-header-avatar">' + ICONS.sparkles + '</div>\
          <div id="htchat-header-info"><h3>AI Assistant</h3><p>Ask me anything</p></div>\
        </div>\
        <div id="htchat-header-actions">\
          <button id="htchat-voice-call-btn" title="Voice call" style="display:none">' + ICONS.phone + '</button>\
          <button id="htchat-close-btn">' + ICONS.close + '</button>\
        </div>\
      </div>\
      <div id="htchat-messages"></div>\
      <div id="htchat-input-area">\
        <div id="htchat-input-row">\
          ' + (hasSTT ? '<button id="htchat-mic-btn" title="Voice input">' + ICONS.mic + '</button>' : '') + '\
          <textarea id="htchat-input" placeholder="' + T.placeholder + '" rows="1"></textarea>\
          <button id="htchat-send-btn" disabled>' + ICONS.send + '</button>\
        </div>\
        <div id="htchat-input-hint"><span>' + T.hint + '</span></div>\
      </div>\
      <div id="htchat-branding" style="text-align:center;font-size:10px;padding:6px 0;color:#9ca3af;border-top:1px solid rgba(0,0,0,0.05)">' + T.branding + '</div>\
    ';

    document.body.appendChild(panel);
    applyColor();

    // Events
    document.getElementById('htchat-close-btn').onclick = togglePanel;
    document.getElementById('htchat-send-btn').onclick = function () { sendMessage(); };
    var inputEl = document.getElementById('htchat-input');
    inputEl.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); }
    });
    inputEl.addEventListener('input', function () {
      document.getElementById('htchat-send-btn').disabled = !inputEl.value.trim() || isLoading;
      sendVisitorTyping();
    });

    if (hasSTT) {
      document.getElementById('htchat-mic-btn').onclick = toggleListening;
    }
    document.getElementById('htchat-voice-call-btn').onclick = toggleVoiceCall;

    renderMessages();
  }

  function togglePanel() {
    isOpen = !isOpen;
    var panel = document.getElementById('htchat-panel');
    var launcher = document.getElementById('htchat-launcher');
    if (isOpen) {
      panel.classList.remove('hidden');
      launcher.style.display = 'none';
      initSession();
      setTimeout(function () { document.getElementById('htchat-input').focus(); }, 100);
      startPolling();
    } else {
      panel.classList.add('hidden');
      launcher.style.display = 'flex';
      stopSpeaking();
      stopPolling();
    }
  }

  // ── Polling for agent/system replies ──
  // The visitor's widget has no other way to find out that an agent has typed
  // a reply from the inbox (we don't ship websockets). Poll on a short interval
  // while the panel is open and append any new messages whose id we haven't
  // seen yet. Idempotent thanks to lastMessageId.
  function startPolling() {
    if (pollTimer) return;
    var run = function () {
      if (!sessionId) return;
      fetch(API + '/poll?session_id=' + encodeURIComponent(sessionId) + '&since_id=' + lastMessageId)
        .then(function (r) { return r.json(); })
        .then(function (data) {
          if (!data || !Array.isArray(data.messages)) return;
          var changed = false;
          data.messages.forEach(function (m) {
            if (m.id > lastMessageId) lastMessageId = m.id;
            // Skip ai messages we already appended locally from sendMessage's
            // own response — but if a different tab/session generated them
            // (or AI was triggered server-side), accept them.
            if (m.sender_type === 'ai' || m.sender_type === 'agent') {
              messages.push({
                role: 'assistant',
                content: m.content,
                sender_type: m.sender_type,
                attachment_url: m.attachment_url || null,
                attachment_type: m.attachment_type || null,
              });
              changed = true;
            } else if (m.sender_type === 'system') {
              messages.push({ role: 'system', content: m.content });
              changed = true;
            }
          });
          var prevAgent = activeAgent;
          if (data.active_agent) {
            activeAgent = data.active_agent;
          } else {
            activeAgent = null;
          }
          var prevTyping = agentTyping;
          agentTyping = !!data.agent_typing;
          // Reflect the live agent identity in the panel header so the
          // visitor sees a real name instead of "Hotel Assistant" once a
          // human takes over.
          var agentChanged = JSON.stringify(prevAgent) !== JSON.stringify(activeAgent);
          if (agentChanged) updateHeaderForAgent();
          // Rating prompt — once the conversation is resolved by an agent,
          // surface a star rating CTA inside the message stream. Only show
          // it once per session.
          if (data.prompt_rating && !ratingPrompted && !ratingSubmitted) {
            ratingPrompted = true;
            messages.push({ role: 'system', kind: 'rating', content: '' });
            changed = true;
          }
          if (changed || prevTyping !== agentTyping) {
            renderMessages();
          }
        })
        .catch(function () {});
    };
    // Run immediately so the first agent reply lands fast, then on interval.
    run();
    pollTimer = setInterval(run, POLL_INTERVAL_MS);
  }

  function stopPolling() {
    if (pollTimer) {
      clearInterval(pollTimer);
      pollTimer = null;
    }
  }

  // Swap the panel header's name + avatar to reflect the active human agent
  // (or revert to the configured assistant when no human is taking over).
  function updateHeaderForAgent() {
    var info = document.getElementById('htchat-header-info');
    if (!info) return;
    var h3 = info.querySelector('h3');
    var sub = info.querySelector('p');
    if (activeAgent && activeAgent.name) {
      if (h3) h3.textContent = activeAgent.name;
      if (sub) sub.textContent = 'Live agent';
    } else if (widgetConfig) {
      if (h3) h3.textContent = widgetConfig.company_name || widgetConfig.assistant_name || 'Assistant';
      if (sub) sub.textContent = (widgetConfig.agent_status === 'online') ? 'Online' : (widgetConfig.header_subtitle || '');
    }
    // Avatar swap (only if the agent has a real avatar URL).
    var avatarBox = document.getElementById('htchat-header-avatar');
    if (avatarBox) {
      if (activeAgent && activeAgent.avatar) {
        avatarBox.innerHTML = '<img src="' + activeAgent.avatar + '" alt="" style="width:100%;height:100%;border-radius:10px;object-fit:cover" />';
      } else if (widgetConfig && widgetConfig.assistant_avatar) {
        avatarBox.innerHTML = '<img src="' + widgetConfig.assistant_avatar + '" alt="" style="width:100%;height:100%;border-radius:10px;object-fit:cover" />';
      }
    }
  }

  function submitRating(rating) {
    if (!sessionId || ratingSubmitted) return;
    ratingSubmitted = true;
    fetch(API + '/rate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ session_id: sessionId, rating: rating }),
    }).catch(function () {});
    // Replace the rating prompt with a thanks bubble.
    for (var i = messages.length - 1; i >= 0; i--) {
      if (messages[i].kind === 'rating') {
        messages[i] = { role: 'system', content: T.thanksRating };
        break;
      }
    }
    renderMessages();
  }

  // Throttled "I am typing" ping. We don't want to hit the server on every
  // keystroke, so this only fires at most once per ~2 seconds. The server
  // sets a 5s window so it stays "warm" between pings.
  function sendVisitorTyping() {
    if (!sessionId) return;
    var now = Date.now();
    if (now - lastTypingPingAt < 2000) return;
    lastTypingPingAt = now;
    fetch(API + '/typing', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ session_id: sessionId, typing: true }),
    }).catch(function () {});
  }

  // ── Config ──
  function loadConfig() {
    fetch(API + '/config').then(function (r) { return r.json(); }).then(function (data) {
      widgetConfig = data;
      applyColor();
      applyBubbleStyles();
      // Re-apply position with config
      var launcher = document.getElementById('htchat-launcher');
      if (launcher) applyPosition(launcher);
      var panel = document.getElementById('htchat-panel');
      if (panel) {
        var pos = getPosition();
        panel.style.left = pos.left === 'auto' ? 'auto' : pos.left;
        panel.style.right = pos.right === 'auto' ? 'auto' : pos.right;
      }
      if (data.company_name) {
        var h3 = document.querySelector('#htchat-header-info h3');
        if (h3) h3.textContent = data.company_name;
      }
      if (data.welcome_message) renderMessages();
      // If we're outside business hours, prepend a sticky offline notice and
      // dim the launcher pulse so visitors know nobody's listening live.
      if (data.is_open === false) {
        var offline = data.offline_message || T.offline;
        if (messages.length === 0 || messages[0].kind !== 'offline') {
          messages.unshift({ role: 'system', kind: 'offline', content: offline });
        }
        var pulse = document.querySelector('#htchat-launcher .htchat-pulse');
        if (pulse) pulse.style.background = '#9ca3af';
        renderMessages();
      }
      // Show voice call button if enabled
      if (data.voice_enabled) {
        var vcBtn = document.getElementById('htchat-voice-call-btn');
        if (vcBtn) vcBtn.style.display = 'flex';
      }
    }).catch(function () {});
  }

  function initSession() {
    fetch(API + '/init', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        session_id: sessionId || null,
        visitor_cookie: getVisitorCookie(),
        page_url: location.href,
        page_title: document.title,
      }),
    })
      .then(function (r) { return r.json(); })
      .then(function (data) {
        if (!data || !data.session_id) return;
        sessionId = data.session_id;
        try { localStorage.setItem(STORAGE_KEY, sessionId); } catch (e) {}
        // Rehydrate existing conversation history so refreshing the page
        // or re-opening the panel keeps the full thread visible.
        if (Array.isArray(data.messages) && data.messages.length > 0) {
          messages = data.messages.map(function (m) {
            if (m.id && m.id > lastMessageId) lastMessageId = m.id;
            return {
              role: m.sender_type === 'visitor' ? 'user'
                  : (m.sender_type === 'agent' || m.sender_type === 'ai') ? 'assistant'
                  : 'system',
              content: m.content || '',
              attachment_url: m.attachment_url || null,
              attachment_type: m.attachment_type || null,
            };
          });
          renderMessages();
        }
      })
      .catch(function () {});
  }

  // ── Messages ──
  function renderMessages() {
    var container = document.getElementById('htchat-messages');
    if (!container) return;

    // GDPR consent gate — block the chat UI behind a consent checkbox until
    // the visitor explicitly accepts. We render this anywhere in the lifecycle
    // (with or without prior messages) so re-opening the panel still gates.
    if (widgetConfig && widgetConfig.gdpr_consent_required && !gdprAccepted) {
      var consentText = widgetConfig.gdpr_consent_text || T.consentText;
      container.innerHTML = '<div class="htchat-welcome">' +
        '<div class="htchat-welcome-icon" style="background:' + getColor() + '22;color:' + getColor() + '">' + ICONS.sparkles + '</div>' +
        '<h3>' + escapeHtml(T.consentTitle) + '</h3>' +
        '<p style="font-size:12px;line-height:1.5">' + escapeHtml(consentText) + '</p>' +
        '<button id="htchat-consent-btn" style="margin-top:10px;background:' + getColor() + ';color:white;border:none;padding:10px 18px;border-radius:8px;font-size:13px;cursor:pointer;font-weight:500">' + escapeHtml(T.consentBtn) + '</button>' +
        '</div>';
      var btn = document.getElementById('htchat-consent-btn');
      if (btn) btn.onclick = function () {
        gdprAccepted = true;
        try { localStorage.setItem('htchat_gdpr_ok', '1'); } catch (e) {}
        renderMessages();
      };
      return;
    }

    if (messages.length === 0) {
      var wc = widgetConfig || {};
      var welcomeTitle = wc.welcome_title || wc.welcome_message || T.welcome;
      var welcomeSub = wc.welcome_subtitle || T.subtitle;
      var showSug = wc.show_suggestions !== false;
      var defaultSug = ['What services do you offer?', 'I want to check my booking', 'Tell me about loyalty rewards'];
      var rawSug = Array.isArray(wc.suggestions) && wc.suggestions.length ? wc.suggestions : defaultSug;
      var suggestions = rawSug.filter(function (s) { return s && String(s).trim(); });
      container.innerHTML = '\
        <div class="htchat-welcome">\
          <div class="htchat-welcome-icon" style="background:' + getColor() + '22;color:' + getColor() + '">' + ICONS.sparkles + '</div>\
          <h3>' + escapeHtml(welcomeTitle) + '</h3>\
          <p>' + escapeHtml(welcomeSub) +
          (hasSTT ? ' <span style="color:' + getColor() + '">You can also use voice input.</span>' : '') +
          '</p>' +
          (showSug && suggestions.length ? '<div class="htchat-suggestions">' +
            suggestions.map(function (s) {
              return '<button class="htchat-suggestion" onclick="document.getElementById(\'htchat-input\').value=\'' + escapeHtml(s) + '\';document.getElementById(\'htchat-send-btn\').disabled=false;document.getElementById(\'htchat-send-btn\').click()">' + escapeHtml(s) + '</button>';
            }).join('') +
          '</div>' : '') +
        '</div>';
      return;
    }

    var c = widgetConfig || {};
    container.innerHTML = messages.map(function (m, idx) {
      // Special "rating" system bubble — interactive 5-star prompt.
      if (m.role === 'system' && m.kind === 'rating') {
        var stars = '';
        for (var i = 1; i <= 5; i++) {
          stars += '<button data-rating="' + i + '" style="background:none;border:none;cursor:pointer;font-size:20px;padding:0 2px;color:#f59e0b">★</button>';
        }
        return '<div class="htchat-msg assistant"><div class="htchat-msg-bubble" style="background:' + (c.bot_bubble_color || '#f3f4f6') + ';color:' + (c.bot_bubble_text || '#1f2937') + '">' +
          '<div style="font-size:12px;margin-bottom:6px">' + escapeHtml(T.ratingHow) + '</div>' +
          '<div data-rating-stars="' + idx + '">' + stars + '</div>' +
          '</div></div>';
      }
      var bubbleStyle = '';
      if (m.role === 'user') {
        bubbleStyle = 'background:' + (c.user_bubble_color || getColor()) + ';color:' + (c.user_bubble_text || '#ffffff');
      } else {
        bubbleStyle = 'background:' + (c.bot_bubble_color || '#f3f4f6') + ';color:' + (c.bot_bubble_text || '#1f2937') + ';border:none';
      }
      var attachmentHtml = '';
      if (m.attachment_url) {
        var url = (m.attachment_url.indexOf('http') === 0) ? m.attachment_url : (API.replace(/\/api\/v1\/widget\/[^/]+$/, '') + m.attachment_url);
        if (m.attachment_type === 'image') {
          attachmentHtml = '<div style="margin-top:6px"><a href="' + url + '" target="_blank" rel="noopener"><img src="' + url + '" style="max-width:200px;max-height:200px;border-radius:8px;display:block" /></a></div>';
        } else {
          attachmentHtml = '<div style="margin-top:6px"><a href="' + url + '" target="_blank" rel="noopener" style="color:inherit;text-decoration:underline;font-size:12px">📎 ' + escapeHtml(m.content || 'Download file') + '</a></div>';
        }
      }
      return '<div class="htchat-msg ' + m.role + '"><div class="htchat-msg-bubble" style="' + bubbleStyle + '">' + (m.attachment_url && m.attachment_type === 'image' ? '' : formatText(m.content)) + attachmentHtml + '</div></div>';
    }).join('');

    // Wire star clicks to submitRating.
    container.querySelectorAll('[data-rating-stars] button').forEach(function (btn) {
      btn.onclick = function () {
        var r = parseInt(btn.getAttribute('data-rating'), 10);
        if (r) submitRating(r);
      };
    });

    if (isLoading || agentTyping) {
      container.innerHTML += '<div class="htchat-msg assistant"><div class="htchat-msg-bubble"><div class="htchat-typing">' +
        '<span style="background:' + getColor() + '"></span><span style="background:' + getColor() + '"></span><span style="background:' + getColor() + '"></span>' +
        '</div></div></div>';
    }

    container.scrollTop = container.scrollHeight;
  }

  function sendMessage(text) {
    var inputEl = document.getElementById('htchat-input');
    var msg = text || (inputEl && inputEl.value.trim());
    if (!msg || isLoading) return;
    if (widgetConfig && widgetConfig.gdpr_consent_required && !gdprAccepted) {
      renderMessages();
      return;
    }

    stopSpeaking();
    messages.push({ role: 'user', content: msg });
    if (inputEl) inputEl.value = '';
    document.getElementById('htchat-send-btn').disabled = true;
    isLoading = true;
    renderMessages();

    fetch(API + '/message', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ session_id: sessionId, message: msg, lang: lastUserLang }),
    })
      .then(function (r) { return r.json(); })
      .then(function (data) {
        // Server may pause AI auto-reply when an agent has taken over the
        // conversation from the inbox. Show a friendly system note instead.
        if (data && data.ai_paused) {
          messages.push({ role: 'system', content: T.notified });
          isLoading = false;
          renderMessages();
          return;
        }
        var reply = data.response || data.message || 'Sorry, I could not process that.';
        messages.push({ role: 'assistant', content: reply });
        // Advance the poll cursor past the AI message we just rendered
        // locally so the next poll doesn't deliver it again as a duplicate.
        if (data.ai_message_id && data.ai_message_id > lastMessageId) {
          lastMessageId = data.ai_message_id;
        }
        isLoading = false;
        renderMessages();
        if (ttsEnabled) speak(reply);
      })
      .catch(function () {
        messages.push({ role: 'assistant', content: T.somethingWrong });
        isLoading = false;
        renderMessages();
      });
  }

  // ── File upload ──
  // Visitor attaches an image or document. We POST it to /upload, then push
  // the resulting message into the local stream so the bubble appears
  // immediately. Polling will then pick up any agent reply that follows.
  function uploadFile(file) {
    if (!file || !sessionId) return;
    if (widgetConfig && widgetConfig.gdpr_consent_required && !gdprAccepted) {
      renderMessages();
      return;
    }
    if (file.size > 8 * 1024 * 1024) {
      messages.push({ role: 'system', content: T.tooLarge });
      renderMessages();
      return;
    }
    var fd = new FormData();
    fd.append('session_id', sessionId);
    fd.append('file', file);
    isLoading = true;
    renderMessages();
    fetch(API + '/upload', { method: 'POST', body: fd })
      .then(function (r) { return r.json(); })
      .then(function (data) {
        isLoading = false;
        if (data && data.attachment_url) {
          messages.push({
            role: 'user',
            content: file.name,
            attachment_url: data.attachment_url,
            attachment_type: data.attachment_type,
          });
          if (data.message_id && data.message_id > lastMessageId) lastMessageId = data.message_id;
        } else {
          messages.push({ role: 'system', content: T.uploadFailed });
        }
        renderMessages();
      })
      .catch(function () {
        isLoading = false;
        messages.push({ role: 'system', content: T.uploadFailed });
        renderMessages();
      });
  }

  // ── Voice: STT ──
  function toggleListening() {
    if (isListening) {
      stopListening();
    } else {
      startListening();
    }
  }

  // Detected language for STT/TTS — uses browser locale, can be overridden by widget config
  var sttLang = (window.HotelChatConfig && window.HotelChatConfig.lang)
    || (navigator.language || navigator.userLanguage || 'en-US');
  var silenceTimer = null;
  var SILENCE_MS = 2500; // auto-finalize after 2.5s of no new speech
  var manualStop = false;

  function startListening() {
    if (!hasSTT || isListening) return;
    recognition = new SpeechRecognition();
    // continuous=true so the browser doesn't cut off at first short pause —
    // we manage end-of-utterance ourselves via a silence timer.
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = sttLang;
    manualStop = false;

    var finalTranscript = '';
    // Track which result indices we've already locked in as final, so a
    // browser that re-emits the same final result across multiple events
    // (Chrome occasionally does this in continuous mode) doesn't append
    // the same words twice.
    var finalizedIdx = {};

    function armSilenceTimer() {
      if (silenceTimer) clearTimeout(silenceTimer);
      silenceTimer = setTimeout(function () {
        if (recognition && isListening) {
          try { recognition.stop(); } catch (e) {}
        }
      }, SILENCE_MS);
    }

    recognition.onstart = function () {
      isListening = true;
      var btn = document.getElementById('htchat-mic-btn');
      if (btn) { btn.className = 'recording'; btn.innerHTML = ICONS.micOff; }
      var hint = document.getElementById('htchat-input-hint');
      if (hint) hint.innerHTML = '<span class="recording-hint"><span class="recording-dot"></span>Listening… tap mic to stop</span>';
      var inputEl = document.getElementById('htchat-input');
      if (inputEl) { inputEl.placeholder = 'Listening…'; inputEl.style.borderColor = '#ef4444'; }
      armSilenceTimer();
    };

    recognition.onresult = function (e) {
      // Walk every result in the buffer, but only fold a finalized result
      // into finalTranscript ONCE — gated by finalizedIdx. This survives
      // both Chrome's resultIndex quirks (sometimes it doesn't advance)
      // and any re-emission of an already-final result.
      var interim = '';
      for (var i = 0; i < e.results.length; i++) {
        var t = e.results[i][0].transcript;
        if (e.results[i].isFinal) {
          if (!finalizedIdx[i]) {
            finalizedIdx[i] = true;
            finalTranscript += t;
          }
        } else {
          interim += t;
        }
      }
      var inputEl = document.getElementById('htchat-input');
      if (inputEl) {
        inputEl.value = (finalTranscript + interim).trim();
        document.getElementById('htchat-send-btn').disabled = !inputEl.value;
      }
      armSilenceTimer();
    };

    recognition.onend = function () {
      if (silenceTimer) { clearTimeout(silenceTimer); silenceTimer = null; }
      isListening = false;
      recognition = null;
      resetMicUI();
      var text = finalTranscript.trim();
      if (text && !manualStop) {
        // Remember language used so the AI replies in the same language
        lastUserLang = sttLang;
        setTimeout(function () { sendMessage(text); }, 150);
      } else if (text && manualStop) {
        // User tapped mic to stop — leave text in input but don't auto-send
        var inputEl = document.getElementById('htchat-input');
        if (inputEl) inputEl.value = text;
      }
    };

    recognition.onerror = function (e) {
      if (silenceTimer) { clearTimeout(silenceTimer); silenceTimer = null; }
      if (e.error !== 'aborted' && e.error !== 'no-speech') console.warn('HotelChat STT error:', e.error);
      isListening = false;
      recognition = null;
      resetMicUI();
    };

    try {
      recognition.start();
    } catch (e) {
      console.warn('HotelChat STT start failed:', e);
      isListening = false;
      recognition = null;
      resetMicUI();
    }
  }

  function stopListening() {
    manualStop = true;
    if (silenceTimer) { clearTimeout(silenceTimer); silenceTimer = null; }
    if (recognition) try { recognition.stop(); } catch (e) {}
  }

  function resetMicUI() {
    var c = widgetConfig || {};
    var btn = document.getElementById('htchat-mic-btn');
    if (btn) { btn.className = ''; btn.innerHTML = ICONS.mic; }
    var hint = document.getElementById('htchat-input-hint');
    if (hint) hint.innerHTML = '<span>' + escapeHtml(c.input_hint_text || T.hint) + '</span>';
    var inputEl = document.getElementById('htchat-input');
    if (inputEl) { inputEl.placeholder = c.input_placeholder || T.placeholder; inputEl.style.borderColor = ''; }
  }

  // ── Voice: TTS ──
  function toggleTTS() {
    ttsEnabled = !ttsEnabled;
    if (!ttsEnabled) stopSpeaking();
    var btn = document.getElementById('htchat-tts-btn');
    if (btn) {
      btn.innerHTML = ttsEnabled ? ICONS.volume : ICONS.volumeOff;
      btn.className = ttsEnabled ? 'active' : '';
    }
  }

  function speak(text) {
    if (!hasTTS || !ttsEnabled) return;
    speechSynthesis.cancel();
    var cleaned = text.replace(/#{1,3}\s/g, '').replace(/\*\*(.+?)\*\*/g, '$1').replace(/`(.+?)`/g, '$1').replace(/[-•*]\s+/g, '').replace(/\d+[.)]\s+/g, '').trim();
    var sentences = cleaned.match(/[^.!?\n]+[.!?\n]?/g) || [cleaned];
    var chunks = [];
    var cur = '';
    for (var i = 0; i < sentences.length; i++) {
      if ((cur + sentences[i]).length > 200) {
        if (cur) chunks.push(cur.trim());
        cur = sentences[i];
      } else { cur += sentences[i]; }
    }
    if (cur.trim()) chunks.push(cur.trim());

    isSpeaking = true;
    var idx = 0;
    function next() {
      if (idx >= chunks.length) { isSpeaking = false; return; }
      var utt = new SpeechSynthesisUtterance(chunks[idx]);
      utt.rate = 1.05;
      utt.lang = lastUserLang;
      var voices = speechSynthesis.getVoices();
      var langPrefix = (lastUserLang || 'en').split('-')[0].toLowerCase();
      // Prefer exact locale match → language family → Google voice → first
      var pref = voices.find(function (v) { return v.lang && v.lang.toLowerCase() === lastUserLang.toLowerCase(); })
        || voices.find(function (v) { return v.lang && v.lang.toLowerCase().indexOf(langPrefix) === 0; })
        || voices.find(function (v) { return v.name && v.name.indexOf('Google') > -1; });
      if (pref) utt.voice = pref;
      utt.onend = function () { idx++; next(); };
      utt.onerror = function () { idx++; next(); };
      speechSynthesis.speak(utt);
    }
    next();
  }

  function stopSpeaking() {
    if (hasTTS) speechSynthesis.cancel();
    isSpeaking = false;
  }

  // ── Voice Agent: WebRTC ──
  function toggleVoiceCall() {
    if (isVoiceCall) {
      endVoiceCall();
    } else {
      startVoiceCall();
    }
  }

  function startVoiceCall() {
    if (isVoiceCall) return;
    showVoiceOverlay('Connecting…');

    // 1. Get ephemeral token from our backend
    fetch(API + '/realtime-session', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })
      .then(function (r) {
        if (!r.ok) return r.json().then(function (d) { throw new Error(d.error || 'Failed'); });
        return r.json();
      })
      .then(function (data) {
        if (!data.client_secret) throw new Error('No client secret');
        return connectWebRTC(data.client_secret, data.voice);
      })
      .catch(function (err) {
        console.error('HotelChat voice error:', err);
        removeVoiceOverlay();
        alert('Voice call unavailable: ' + (err.message || 'Unknown error'));
      });
  }

  function connectWebRTC(ephemeralKey, voice) {
    // 2. Create PeerConnection
    voicePc = new RTCPeerConnection();

    // 3. Set up audio output
    voiceAudioEl = document.createElement('audio');
    voiceAudioEl.autoplay = true;
    voicePc.ontrack = function (e) {
      voiceAudioEl.srcObject = e.streams[0];
    };

    // 4. Get microphone and add track
    return navigator.mediaDevices.getUserMedia({ audio: true }).then(function (stream) {
      stream.getTracks().forEach(function (track) {
        voicePc.addTrack(track, stream);
      });

      // 5. Create data channel for events
      voiceDataChannel = voicePc.createDataChannel('oai-events');
      voiceDataChannel.onopen = function () {
        isVoiceCall = true;
        updateVoiceCallUI(true);
        updateVoiceOverlayStatus('Listening…');
        // Send initial response.create to tell the model to greet
        voiceDataChannel.send(JSON.stringify({
          type: 'response.create',
          response: {
            modalities: ['text', 'audio'],
            instructions: 'Greet the caller warmly and ask how you can help.',
          },
        }));
      };
      voiceDataChannel.onmessage = function (e) {
        handleRealtimeEvent(JSON.parse(e.data));
      };
      voiceDataChannel.onclose = function () {
        endVoiceCall();
      };

      // 6. Create and set local offer
      return voicePc.createOffer();
    }).then(function (offer) {
      return voicePc.setLocalDescription(offer);
    }).then(function () {
      // 7. Send offer to OpenAI Realtime API
      var model = 'gpt-4o-realtime-preview';
      return fetch('https://api.openai.com/v1/realtime?model=' + model, {
        method: 'POST',
        headers: {
          'Authorization': 'Bearer ' + ephemeralKey,
          'Content-Type': 'application/sdp',
        },
        body: voicePc.localDescription.sdp,
      });
    }).then(function (r) {
      if (!r.ok) throw new Error('OpenAI Realtime SDP exchange failed');
      return r.text();
    }).then(function (sdp) {
      return voicePc.setRemoteDescription({ type: 'answer', sdp: sdp });
    });
  }

  function handleRealtimeEvent(event) {
    if (!event || !event.type) return;

    switch (event.type) {
      case 'response.audio_transcript.done':
        // AI finished speaking — add transcript to chat
        if (event.transcript) {
          messages.push({ role: 'assistant', content: event.transcript });
          renderMessages();
        }
        break;

      case 'conversation.item.input_audio_transcription.completed':
        // User speech transcribed
        if (event.transcript) {
          messages.push({ role: 'user', content: event.transcript });
          renderMessages();
        }
        break;

      case 'input_audio_buffer.speech_started':
        updateVoiceOverlayStatus('Listening…');
        break;

      case 'input_audio_buffer.speech_stopped':
        updateVoiceOverlayStatus('Processing…');
        break;

      case 'response.audio.started':
      case 'response.created':
        updateVoiceOverlayStatus('Speaking…');
        break;

      case 'response.done':
        updateVoiceOverlayStatus('Listening…');
        break;

      case 'error':
        console.error('Realtime error:', event.error);
        break;
    }
  }

  function endVoiceCall() {
    isVoiceCall = false;

    if (voiceDataChannel) {
      try { voiceDataChannel.close(); } catch (e) {}
      voiceDataChannel = null;
    }
    if (voicePc) {
      voicePc.getSenders().forEach(function (sender) {
        if (sender.track) sender.track.stop();
      });
      try { voicePc.close(); } catch (e) {}
      voicePc = null;
    }
    if (voiceAudioEl) {
      voiceAudioEl.srcObject = null;
      voiceAudioEl = null;
    }

    updateVoiceCallUI(false);
    removeVoiceOverlay();
  }

  function showVoiceOverlay(status) {
    removeVoiceOverlay();
    var panel = document.getElementById('htchat-panel');
    if (!panel) return;
    var overlay = document.createElement('div');
    overlay.id = 'htchat-voice-overlay';
    overlay.innerHTML = '\
      <div class="voice-wave" style="background:' + getColor() + '">' + ICONS.phone + '</div>\
      <p>Voice Call</p>\
      <span class="voice-status" id="htchat-voice-status">' + (status || 'Connecting…') + '</span>\
      <button class="end-call-btn" id="htchat-end-call">' + ICONS.phoneOff + ' End Call</button>';
    panel.appendChild(overlay);
    document.getElementById('htchat-end-call').onclick = endVoiceCall;
  }

  function updateVoiceOverlayStatus(text) {
    var el = document.getElementById('htchat-voice-status');
    if (el) el.textContent = text;
  }

  function removeVoiceOverlay() {
    var overlay = document.getElementById('htchat-voice-overlay');
    if (overlay) overlay.remove();
  }

  function updateVoiceCallUI(active) {
    var btn = document.getElementById('htchat-voice-call-btn');
    if (btn) {
      btn.className = active ? 'active' : '';
      btn.innerHTML = active ? ICONS.phoneOff : ICONS.phone;
      btn.title = active ? 'End voice call' : 'Voice call';
    }
  }

  // ── Helpers ──
  function escapeHtml(str) {
    var div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  function formatText(text) {
    return escapeHtml(text)
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/`(.+?)`/g, '<code style="background:#f3f4f6;padding:1px 4px;border-radius:3px;font-size:12px">$1</code>')
      .replace(/\n/g, '<br>');
  }

  // ── Boot ──
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
