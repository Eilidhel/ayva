// Shared helpers for the share (broadcaster) and watch (TV) pages.

var STRINGS = {
  en: {
    tagline: 'Show your screen on any TV. No cables, just a link.',
    shareTitle: 'Share this screen',
    shareDesc: 'Use this on the computer you want to stream from.',
    watchTitle: 'Watch on this TV',
    watchDesc: 'Open this on the TV, phone or any other screen.',
    yourCode: 'Your code',
    openOnTv: 'On the TV open',
    orEnterCode: 'or open the site and enter the code',
    quality: 'Quality',
    startShare: 'Start sharing',
    stopShare: 'Stop sharing',
    viewers: 'Watching',
    connecting: 'Connecting to server…',
    disconnected: 'Connection to server lost. Reconnecting…',
    notStreaming: 'Not sharing yet. Press "Start sharing" and pick a screen or window.',
    streaming: 'Live',
    offline: 'Offline',
    pickSource: 'What do you want to share?',
    cancel: 'Cancel',
    sendAudio: 'Also send the computer\'s sound',
    entireScreen: 'Entire screen',
    tvAppTip: 'With the Ayva TV app, the TV finds this computer by itself.',
    connectionInfo: 'Connection details (red = problem)',
    statVideo: 'Video',
    statAudio: 'Sound',
    statDecode: 'decode',
    statDropped: 'dropped',
    statLoss: 'loss',
    statConcealed: 'filled-in',
    statStretch: 'stretched',
    statDelay: 'delay',
    statPlayout: 'Playback',
    statElement: 'standard',
    statBuffer: 'buffer',
    statGaps: 'gaps',
    statSend: 'Sending',
    statCapture: 'capture',
    statEncode: 'encode',
    statLimit: 'limited by',
    statVideoNet: 'Video arrival',
    statArriving: 'arriving',
    statFreezes: 'freezes',
    switchSource: 'Switch screen',
    sendFile: 'Send file',
    sendClipboard: 'Send clipboard',
    sending: 'Sending {name}…',
    sent: '{name} sent.',
    fileFailed: '{name} could not be transferred.',
    receiving: 'Receiving {name} from {who}…',
    fileSaved: '{name} from {who} saved to Downloads\\Ayva.',
    fileSavedTitle: 'File received',
    clipReceived: 'Text from {who} copied to this computer\'s clipboard.',
    clipEmpty: 'The clipboard has no text.',
    clipSent: 'Clipboard sent.',
    send: 'Send',
    save: 'Save',
    copy: 'Copy',
    copied: 'Copied',
    clipFromComputer: 'From computer',
    receivingFile: 'Receiving {name}…',
    refusedByComputer: 'The computer only accepts files and text while remote control is on.',
    sendFilesToComputer: 'Send files to the computer',
    sendTextToComputer: 'Send text to the computer\'s clipboard',
    pasteHere: 'Type or paste text…',
    clipSentToComputer: 'Text sent to the computer.',
    sendingBatch: 'Sending {done}/{total}',
    sentBatch: '{total} files sent to the computer.',
    batchFailed: 'Sending stopped halfway ({done}/{total}).',
    receivingBatch: 'Receiving files from {who}: {done}/{total}',
    batchSaved: '{count} files from {who} saved to {folder}',
    batchSavedTitle: '{count} files received',
    openFolder: 'Open folder',
    startWithWindows: 'Start Ayva in the background when Windows starts',
    cloudSetup: 'Set up a fixed address (Cloudflare)',
    cloudNotSet: 'For the same link and QR code every time.',
    cloudConnecting: 'Connecting to the fixed address…',
    cloudConnected: 'Fixed address ready.',
    cloudUnreachable: 'This computer can\'t reach the fixed address. Your internet provider may be blocking workers.dev addresses. Connecting your own domain fixes this.',
    cloudScan: 'This link and QR code never change. Scan with your phone and enter your password once:',
    cloudRemove: 'Remove this computer',
    cloudRemoveConfirm: 'Remove this computer from the fixed address? (Other computers on the Cloudflare account are not affected.)',
    cloudSetupTitle: 'Set up a fixed address',
    cloudStep1: 'While logged in to Cloudflare, open the API tokens page:',
    cloudOpenTokens: 'API Tokens page',
    cloudStep2: '"Create Token" → "Use template" next to "Edit Cloudflare Workers" → under "Account Resources" pick your account, under "Zone Resources" pick "All zones" → "Continue to summary" → "Create Token".',
    cloudStep3: 'Copy the token and paste it below. Don\'t send the token anywhere else or to anyone.',
    cloudTokenLabel: 'Cloudflare API token',
    cloudPasswordLabel: 'Viewing password (at least 8 characters)',
    cloudPasswordAgain: 'Viewing password (again)',
    cloudPasswordNote: 'Phones ask for this password the first time they open the address. If Ayva is already set up on this account (from another computer), you can leave it empty.',
    cloudGo: 'Set up',
    cloudStepAccount: 'Checking the Cloudflare account…',
    cloudStepUpload: 'Uploading Ayva to the account…',
    cloudStepSecrets: 'Setting security keys…',
    cloudStepAddress: 'Opening the address…',
    cloudStepWaiting: 'Waiting for the address to appear on the internet (can take 1-2 minutes the first time)…',
    cloudErrToken: 'Paste the API token.',
    cloudErrMismatch: 'The passwords don\'t match.',
    cloudErrPasswordShort: 'The password must be at least 8 characters.',
    cloudErrPasswordRequired: 'First setup on this account: choose a viewing password.',
    cloudErrAccount: 'No Cloudflare account could be reached with this token. Make sure you picked your account in the template.',
    cloudErrGeneric: 'Setup could not finish:',
    serverLostKeepWatching: 'Lost the server connection, reconnecting. The picture comes directly, so you can keep watching.',
    computerLabel: 'Computer',
    hideUi: 'Hide buttons',
    showUi: 'Show buttons',
    cloudSlowTip: 'Still connecting to the server… Some internet providers block this address. In Chrome: ⋮ → Settings → Privacy and security → Use secure DNS → "Choose another provider" → Cloudflare (1.1.1.1), then reopen this page.',
    enterPassword: 'Enter your Ayva password',
    pickComputer: 'Choose a computer to watch',
    noComputers: 'No computer is online right now. Is Ayva open on your computer?',
    wrongPassword: 'Wrong password.',
    tooManyTries: 'Too many wrong tries. Try again in 15 minutes.',
    continue: 'Continue',
    ready: 'Ready',
    rename: 'Rename',
    renamePlaceholder: 'e.g. Alex\'s phone',
    deviceNameLabel: 'Device name (change it if you like)',
    devicesTitle: 'Connected devices',
    askApproval: 'Ask before new devices connect',
    trustedTitle: 'Remembered devices (connect without asking)',
    approvalTitle: 'A device wants to watch',
    rememberDevice: 'Remember this device',
    approve: 'Allow',
    reject: 'Deny',
    viaInternet: 'internet',
    viaLan: 'home network',
    remembered: 'remembered',
    kick: 'Disconnect',
    forget: 'Forget',
    noDevices: 'No device connected.',
    unknownDevice: 'Unknown device',
    waitingApproval: 'Waiting for the computer to allow this device…',
    rejected: 'The computer did not allow this device.',
    kicked: 'The computer disconnected this device.',
    showCode: 'Show',
    hideCode: 'Hide',
    internetOn: 'Allow access over the internet',
    internetOff: 'Turn off internet access',
    internetStarting: 'Starting…',
    internetConnecting: 'Opening a secure tunnel…',
    internetDownloading: 'Downloading the tunnel tool (first time only):',
    internetFailed: 'Internet access could not start: ',
    internetStopped: 'Internet access turned off.',
    internetScan: 'Scan with your phone, or open this link on any network:',
    internetWarning: 'Anyone with this link can watch (and control, if allowed). Don\'t share it. A new link is made each time.',
    copyLink: 'Copy link',
    linkCopied: 'Link copied.',
    accessDenied: 'This link is no longer valid. Get a new link from the computer.',
    controlOn: 'Allow control',
    controlOff: 'Stop control',
    controlHint: 'Control is on: watching devices can use this computer\'s mouse and keyboard. Emergency off: Ctrl+Alt+K',
    controlling: 'controlling',
    controlEnabled: 'Remote control is on',
    controlDisabled: 'Remote control is off',
    keyboard: 'Keyboard',
    device_tv: 'TV',
    device_phone: 'Phone',
    device_browser: 'Browser',
    device_tablet: 'tablet',
    statPacing: 'Smoothness',
    statFrameGap: 'frame every',
    statHitches: 'hitches',
    statLongest: 'longest',
    limit_none: 'nothing',
    limit_cpu: 'CPU',
    limit_bandwidth: 'bandwidth',
    limit_other: 'other',
    shareFailed: 'Could not start sharing: ',
    unsupported: 'This browser cannot share the screen. Use Chrome or Edge on a computer.',
    audioTip: 'Tip: to send sound, tick "Share system audio" in the browser dialog.',
    enterCode: 'Enter the 6-digit code shown on the computer',
    watch: 'Watch',
    noRoom: 'No stream with this code. Check the code on the computer.',
    waitingHost: 'Connected. Waiting for the computer to start sharing…',
    hostGone: 'The computer stopped. Waiting for it to come back…',
    connectingPeer: 'Connecting to the stream…',
    unmute: 'Turn sound on',
    fullscreen: 'Full screen',
    change: 'Change code',
    peerFailed: 'Connection problem. Retrying…',
    clear: 'Clear',
    canStart: 'Can start sharing',
    canStartHint: 'This device can start and stop sharing the main screen. You get a notification each time.',
    canStartTag: 'can start sharing',
    proofFailed: '{who} could not prove it is the remembered device and was disconnected. If it really is yours (for example its browser data was cleared), forget it and let it in again.',
    cannotRemember: '{who} cannot be remembered: it has no safe place for a device key. Use the Ayva phone app, the fixed address or the internet link.',
    needsReapproval: 'asks again once',
    pinTag: 'PIN',
    pinHint: 'Ask this device for a PIN before it may start sharing or control',
    pinPlaceholder: 'New PIN (4-8 digits)',
    pinRule: 'Only 4-8 digits',
    pinRemove: 'Remove PIN',
    pinLockedHost: '{who} entered a wrong PIN 5 times. Its rights are locked for 15 minutes.',
    pinUnlock: 'Enter PIN',
    pinPrompt: 'Enter the PIN set for this device on the computer.',
    pinWrong: 'Wrong PIN.',
    pinLocked: 'Too many wrong tries. Try again in 15 minutes.',
    pinAccepted: 'PIN accepted.',
    pinUnavailable: 'This page cannot send the PIN safely. Use the Ayva app or the fixed address.',
    historyTitle: 'Connection history',
    updVersion: 'Ayva {v}',
    updLatest: 'Ayva {v} · up to date',
    updChecking: 'Ayva {v} · checking for updates…',
    updDownloading: 'Ayva {v} · downloading {new}…',
    updReady: 'Ayva {new} is ready.',
    updError: 'Ayva {v} · could not check for updates',
    updCheck: 'Check for updates',
    updInstall: 'Restart and update',
    micOutput: 'Phone voice ("Talk") plays on:',
    micOutputDefault: 'Default speakers',
    micOutputHint: 'For Discord and other apps, install the free VB-CABLE, choose "CABLE Input" here and "CABLE Output" as the microphone in Discord.',
    turnTitle: 'Backup route (Cloudflare TURN)',
    turnOff: 'off',
    turnOnShort: 'on',
    turnFull: 'limit reached',
    turnIntro: 'For networks where the picture never arrives (some mobile, work and hotel networks). Create a TURN key in your free Cloudflare account and paste its two values here. The steps are on Ayva\'s GitHub page, under "Backup route".',
    turnKeyId: 'Turn Token ID',
    turnToken: 'API Token',
    turnSave: 'Turn on',
    turnRemove: 'Turn off the backup route',
    turnChecking: 'Checking with Cloudflare…',
    turnOn: 'Devices over the internet can use the backup route when a direct connection fails. This month about {used} GB of {limit} GB went over it.',
    turnOverLimit: 'This month\'s limit is reached ({used} GB of {limit} GB). The backup route stays off until next month, or until you raise the limit.',
    turnHideIp: 'Hide this computer\'s IP address from devices over the internet (they always use the backup route)',
    turnLimit: 'Monthly limit (GB):',
    turnLimitTitle: 'Backup route: this month\'s limit is reached',
    'turn-missing': 'Paste both the Turn Token ID and the API Token.',
    'turn-rejected': 'Cloudflare did not accept this Turn Token ID and API Token.',
    'turn-unreachable': 'Could not reach Cloudflare. Check the internet connection and try again.',
    'turn-no-encryption': 'Windows cannot store the token safely on this computer, so it was not saved.',
    relayTag: 'backup route',
    historyEmpty: 'Nothing yet.',
    historyClear: 'Clear history',
    historyClearAsk: 'Clear the whole connection history?',
    histJoined: '{who} connected ({via})',
    histLeft: '{who} left after {time}',
    histAllowed: 'You let {who} in',
    histDenied: 'You turned {who} away',
    histKicked: 'You disconnected {who}',
    histProofFailed: '{who} could not prove it is the remembered device and was cut off',
    histPinWrong: '{who} entered a wrong PIN',
    histPinLocked: '{who} entered too many wrong PINs and was locked for 15 minutes',
    histRemoteFailed: '{who} could not start sharing',
    histRecording: '{who} started recording',
    histTalking: '{who} turned the microphone on',
    durShort: 'under a minute',
    durMin: '{m} min',
    durHour: '{h} h {m} min',
    canControl: 'Can control',
    canControlHint: 'While sharing, this device can use the mouse and keyboard without pressing Allow control. Ctrl+Alt+K stops it.',
    controlTag: 'can control',
    controlHintDevices: 'Devices you marked "Can control" can use this computer\'s mouse and keyboard. Emergency off: Ctrl+Alt+K',
    remoteStarted: '{who} started sharing.',
    remoteStopped: '{who} stopped sharing.',
    remoteStartFailed: '{who} could not start sharing: ',
    remoteStarting: 'Starting…',
    recordingTitle: 'A device is recording the stream',
    recordingTag: 'recording',
    talkingTag: 'microphone on',
    record: 'Record',
    recordStop: 'Stop recording',
    recordFailed: 'Recording could not start on this device.',
    recordSaved: 'Recording ready. Tap Save to keep it.',
    micOn: 'Talk',
    micOff: 'Turn mic off',
    micStarting: 'Microphone…',
    micLive: 'Your microphone is playing on the computer.',
    micNeedsHttps: 'The microphone only works when Ayva is opened over https (the fixed address or the internet link), not on the home network address.',
    micBlocked: 'Microphone permission was denied.',
    micFailed: 'The microphone could not connect.',
    micRefused: 'The computer accepts the microphone only from remembered devices, or while remote control is on.',
  },
  tr: {
    tagline: 'Ekranını herhangi bir TV\'de göster. Kablo yok, sadece bir link.',
    shareTitle: 'Bu ekranı paylaş',
    shareDesc: 'Yayın yapmak istediğin bilgisayarda bunu aç.',
    watchTitle: 'Bu TV\'de izle',
    watchDesc: 'Bunu TV\'de, telefonda ya da başka bir ekranda aç.',
    yourCode: 'Kodun',
    openOnTv: 'TV\'de şunu aç',
    orEnterCode: 'ya da siteyi açıp kodu gir',
    quality: 'Kalite',
    startShare: 'Paylaşımı başlat',
    stopShare: 'Paylaşımı durdur',
    viewers: 'İzleyen',
    connecting: 'Sunucuya bağlanılıyor…',
    disconnected: 'Sunucu bağlantısı koptu. Yeniden bağlanılıyor…',
    notStreaming: 'Henüz paylaşım yok. "Paylaşımı başlat"a bas ve bir ekran ya da pencere seç.',
    streaming: 'Canlı',
    offline: 'Kapalı',
    pickSource: 'Neyi paylaşmak istiyorsun?',
    cancel: 'Vazgeç',
    sendAudio: 'Bilgisayarın sesini de gönder',
    entireScreen: 'Tüm ekran',
    tvAppTip: 'Ayva TV uygulamasıyla TV bu bilgisayarı kendisi bulur.',
    connectionInfo: 'Bağlantı bilgisi (kırmızı = sorun)',
    statVideo: 'Görüntü',
    statAudio: 'Ses',
    statDecode: 'çözme',
    statDropped: 'düşen kare',
    statLoss: 'kayıp',
    statConcealed: 'telafi',
    statStretch: 'esnetme',
    statDelay: 'gecikme',
    statPlayout: 'Çalma',
    statElement: 'standart',
    statBuffer: 'tampon',
    statGaps: 'boşluk',
    statSend: 'Gönderim',
    statCapture: 'yakalama',
    statEncode: 'kodlama',
    statLimit: 'sınırlayan',
    statVideoNet: 'Görüntü akışı',
    statArriving: 'gelen',
    statFreezes: 'donma',
    switchSource: 'Ekranı değiştir',
    sendFile: 'Dosya gönder',
    sendClipboard: 'Panoyu gönder',
    sending: '{name} gönderiliyor…',
    sent: '{name} gönderildi.',
    fileFailed: '{name} aktarılamadı.',
    receiving: '{who} cihazından {name} alınıyor…',
    fileSaved: '{who} cihazından gelen {name}, İndirilenler\\Ayva klasörüne kaydedildi.',
    fileSavedTitle: 'Dosya alındı',
    clipReceived: '{who} cihazından gelen yazı bu bilgisayarın panosuna kopyalandı.',
    clipEmpty: 'Panoda yazı yok.',
    clipSent: 'Pano gönderildi.',
    send: 'Gönder',
    save: 'Kaydet',
    copy: 'Kopyala',
    copied: 'Kopyalandı',
    clipFromComputer: 'Bilgisayardan',
    receivingFile: '{name} alınıyor…',
    refusedByComputer: 'Bilgisayar dosya ve yazıyı yalnızca uzaktan kontrol açıkken kabul ediyor.',
    sendFilesToComputer: 'Bilgisayara dosya gönder',
    sendTextToComputer: 'Yazıyı bilgisayarın panosuna gönder',
    pasteHere: 'Yazı yaz ya da yapıştır…',
    clipSentToComputer: 'Yazı bilgisayara gönderildi.',
    sendingBatch: 'Gönderiliyor {done}/{total}',
    sentBatch: '{total} dosya bilgisayara gönderildi.',
    batchFailed: 'Gönderim yarıda kaldı ({done}/{total}).',
    receivingBatch: '{who} cihazından dosyalar alınıyor: {done}/{total}',
    batchSaved: '{who} cihazından {count} dosya kaydedildi: {folder}',
    batchSavedTitle: '{count} dosya alındı',
    openFolder: 'Klasörü aç',
    startWithWindows: 'Windows açılınca Ayva\'yı arka planda başlat',
    cloudSetup: 'Sabit adres kur (Cloudflare)',
    cloudNotSet: 'Her seferinde aynı link ve QR kod için.',
    cloudConnecting: 'Sabit adrese bağlanılıyor…',
    cloudConnected: 'Sabit adres hazır.',
    cloudUnreachable: 'Bu bilgisayar sabit adrese ulaşamıyor. İnternet sağlayıcın workers.dev adreslerini engelliyor olabilir. Kendi alan adını bağlamak bunu çözer.',
    cloudScan: 'Bu link ve QR kod hiç değişmez. Telefonla okut, bir kez şifreni gir:',
    cloudRemove: 'Bu bilgisayarı kaldır',
    cloudRemoveConfirm: 'Bu bilgisayar sabit adresten kaldırılsın mı? (Cloudflare hesabındaki diğer bilgisayarlar etkilenmez.)',
    cloudSetupTitle: 'Sabit adres kur',
    cloudStep1: 'Cloudflare\'de oturum açıkken API anahtarları sayfasını aç:',
    cloudOpenTokens: 'API Tokens sayfası',
    cloudStep2: '"Create Token" → "Edit Cloudflare Workers" satırında "Use template" → "Account Resources" kısmında hesabını, "Zone Resources" kısmında "All zones" seç → "Continue to summary" → "Create Token".',
    cloudStep3: 'Çıkan anahtarı kopyala ve aşağıya yapıştır. Anahtarı başka hiçbir yere ya da kimseye gönderme.',
    cloudTokenLabel: 'Cloudflare API anahtarı',
    cloudPasswordLabel: 'İzleme şifresi (en az 8 karakter)',
    cloudPasswordAgain: 'İzleme şifresi (tekrar)',
    cloudPasswordNote: 'Telefonlar bu adrese ilk girişte bu şifreyi soracak. Bu hesapta Ayva zaten kuruluysa (başka bir bilgisayardan) şifreyi boş bırakabilirsin.',
    cloudGo: 'Kur',
    cloudStepAccount: 'Cloudflare hesabı kontrol ediliyor…',
    cloudStepUpload: 'Ayva hesabına yükleniyor…',
    cloudStepSecrets: 'Güvenlik anahtarları ayarlanıyor…',
    cloudStepAddress: 'Adres açılıyor…',
    cloudStepWaiting: 'Adresin internette görünmesi bekleniyor (ilk seferde 1-2 dakika sürebilir)…',
    cloudErrToken: 'API anahtarını yapıştır.',
    cloudErrMismatch: 'Şifreler aynı değil.',
    cloudErrPasswordShort: 'Şifre en az 8 karakter olmalı.',
    cloudErrPasswordRequired: 'Bu hesapta ilk kurulum: bir izleme şifresi belirle.',
    cloudErrAccount: 'Bu anahtarla bir Cloudflare hesabına ulaşılamadı. Şablonda hesabını seçtiğinden emin ol.',
    cloudErrGeneric: 'Kurulum tamamlanamadı:',
    serverLostKeepWatching: 'Sunucu bağlantısı koptu, yeniden bağlanılıyor. Görüntü doğrudan geldiği için izlemeye devam edebilirsin.',
    computerLabel: 'Bilgisayar',
    hideUi: 'Butonları gizle',
    showUi: 'Butonları göster',
    cloudSlowTip: 'Sunucuya hâlâ bağlanılıyor… Bazı internet sağlayıcıları bu adresi engelliyor. Chrome\'da ⋮ → Ayarlar → Gizlilik ve güvenlik → Güvenli DNS kullan → "Başka bir sağlayıcı seçin" → Cloudflare (1.1.1.1) seçip bu sayfayı yeniden aç.',
    enterPassword: 'Ayva şifreni gir',
    pickComputer: 'İzlemek için bir bilgisayar seç',
    noComputers: 'Şu an açık bir bilgisayar yok. Bilgisayarda Ayva açık mı?',
    wrongPassword: 'Şifre yanlış.',
    tooManyTries: 'Çok fazla yanlış deneme. 15 dakika sonra tekrar dene.',
    continue: 'Devam',
    ready: 'Hazır',
    rename: 'Yeniden adlandır',
    renamePlaceholder: 'ör. Ahmet\'in telefonu',
    deviceNameLabel: 'Cihazın adı (istersen değiştir)',
    devicesTitle: 'Bağlı cihazlar',
    askApproval: 'Yeni cihazlar bağlanmadan önce sor',
    trustedTitle: 'Hatırlanan cihazlar (sormadan bağlanır)',
    approvalTitle: 'Bir cihaz izlemek istiyor',
    rememberDevice: 'Bu cihazı hatırla',
    approve: 'İzin ver',
    reject: 'Reddet',
    viaInternet: 'internet',
    viaLan: 'ev ağı',
    remembered: 'hatırlanıyor',
    kick: 'Bağlantıyı kes',
    forget: 'Unut',
    noDevices: 'Bağlı cihaz yok.',
    unknownDevice: 'Bilinmeyen cihaz',
    waitingApproval: 'Bilgisayarın bu cihaza izin vermesi bekleniyor…',
    rejected: 'Bilgisayar bu cihaza izin vermedi.',
    kicked: 'Bilgisayar bu cihazın bağlantısını kesti.',
    showCode: 'Göster',
    hideCode: 'Gizle',
    internetOn: 'İnternetten erişimi aç',
    internetOff: 'İnternet erişimini kapat',
    internetStarting: 'Hazırlanıyor…',
    internetConnecting: 'Güvenli tünel açılıyor…',
    internetDownloading: 'Tünel aracı indiriliyor (sadece ilk sefer):',
    internetFailed: 'İnternet erişimi başlatılamadı: ',
    internetStopped: 'İnternet erişimi kapandı.',
    internetScan: 'Telefonla okut ya da bu linki herhangi bir ağdan aç:',
    internetWarning: 'Bu linke sahip olan herkes izleyebilir (izin verirsen kontrol de edebilir). Kimseyle paylaşma. Her seferinde yeni link oluşur.',
    copyLink: 'Linki kopyala',
    linkCopied: 'Link kopyalandı.',
    accessDenied: 'Bu link artık geçerli değil. Bilgisayardan yeni link al.',
    controlOn: 'Kontrolü aç',
    controlOff: 'Kontrolü kapat',
    controlHint: 'Kontrol açık: yayını izleyen cihazlar bu bilgisayarın faresini ve klavyesini kullanabilir. Acil kapatma: Ctrl+Alt+K',
    controlling: 'kontrol ediyor',
    controlEnabled: 'Uzaktan kontrol açık',
    controlDisabled: 'Uzaktan kontrol kapalı',
    keyboard: 'Klavye',
    device_tv: 'TV',
    device_phone: 'Telefon',
    device_browser: 'Tarayıcı',
    device_tablet: 'tablet',
    statPacing: 'Akıcılık',
    statFrameGap: 'kare aralığı',
    statHitches: 'takılma',
    statLongest: 'en uzun',
    limit_none: 'yok',
    limit_cpu: 'işlemci',
    limit_bandwidth: 'bant genişliği',
    limit_other: 'diğer',
    shareFailed: 'Paylaşım başlatılamadı: ',
    unsupported: 'Bu tarayıcı ekran paylaşamıyor. Bilgisayarda Chrome ya da Edge kullan.',
    audioTip: 'İpucu: sesi de göndermek için tarayıcı penceresinde "Sistem sesini paylaş"ı işaretle.',
    enterCode: 'Bilgisayarda görünen 6 haneli kodu gir',
    watch: 'İzle',
    noRoom: 'Bu kodla bir yayın yok. Bilgisayardaki kodu kontrol et.',
    waitingHost: 'Bağlandı. Bilgisayarın paylaşımı başlatması bekleniyor…',
    hostGone: 'Bilgisayar yayını kapattı. Geri gelmesi bekleniyor…',
    connectingPeer: 'Yayına bağlanılıyor…',
    unmute: 'Sesi aç',
    fullscreen: 'Tam ekran',
    change: 'Kodu değiştir',
    peerFailed: 'Bağlantı sorunu. Tekrar deneniyor…',
    clear: 'Sil',
    canStart: 'Paylaşımı başlatabilir',
    canStartHint: 'Bu cihaz ana ekranın paylaşımını başlatıp durdurabilir. Her seferinde bildirim alırsın.',
    canStartTag: 'başlatabilir',
    proofFailed: '{who} hatırlanan cihaz olduğunu kanıtlayamadı ve bağlantısı kesildi. Gerçekten seninse (ör. tarayıcı verileri silindiyse) unutup yeniden izin ver.',
    cannotRemember: '{who} hatırlanamıyor: cihaz anahtarını saklayacak güvenli bir yeri yok. Ayva telefon uygulamasını, sabit adresi ya da internet linkini kullan.',
    needsReapproval: 'bir kez daha sorulacak',
    pinTag: 'PIN',
    pinHint: 'Bu cihaz paylaşımı başlatmadan ya da kontrol etmeden önce PIN sorulsun',
    pinPlaceholder: 'Yeni PIN (4-8 rakam)',
    pinRule: 'Sadece 4-8 rakam',
    pinRemove: "PIN'i kaldır",
    pinLockedHost: '{who} 5 kez yanlış PIN girdi. Hakları 15 dakika kilitlendi.',
    pinUnlock: 'PIN gir',
    pinPrompt: "Bilgisayarda bu cihaz için belirlenen PIN'i gir.",
    pinWrong: 'PIN yanlış.',
    pinLocked: 'Çok fazla yanlış deneme. 15 dakika sonra tekrar dene.',
    pinAccepted: 'PIN kabul edildi.',
    pinUnavailable: "Bu sayfa PIN'i güvenle gönderemiyor. Ayva uygulamasını ya da sabit adresi kullan.",
    historyTitle: 'Bağlantı geçmişi',
    updVersion: 'Ayva {v}',
    updLatest: 'Ayva {v} · güncel',
    updChecking: 'Ayva {v} · güncellemeler denetleniyor…',
    updDownloading: 'Ayva {v} · {new} indiriliyor…',
    updReady: 'Ayva {new} hazır.',
    updError: 'Ayva {v} · güncellemeler denetlenemedi',
    updCheck: 'Güncellemeleri denetle',
    updInstall: 'Yeniden başlat ve güncelle',
    micOutput: 'Telefonun sesi ("Konuş") şuradan çıksın:',
    micOutputDefault: 'Varsayılan hoparlör',
    micOutputHint: 'Discord ve diğer programlar için ücretsiz VB-CABLE\'ı kur, burada "CABLE Input"u, Discord\'da mikrofon olarak "CABLE Output"u seç.',
    turnTitle: 'Yedek yol (Cloudflare TURN)',
    turnOff: 'kapalı',
    turnOnShort: 'açık',
    turnFull: 'sınır doldu',
    turnIntro: "Görüntünün hiç gelmediği ağlar için (bazı mobil, iş ve otel ağları). Ücretsiz Cloudflare hesabında bir TURN anahtarı oluştur ve iki değerini buraya yapıştır. Adımlar Ayva'nın GitHub sayfasında, \"Yedek yol\" bölümünde.",
    turnKeyId: 'Turn Token ID',
    turnToken: 'API Token',
    turnSave: 'Aç',
    turnRemove: 'Yedek yolu kapat',
    turnChecking: 'Cloudflare ile kontrol ediliyor…',
    turnOn: 'İnternetten bağlanan cihazlar, doğrudan bağlantı kurulamazsa yedek yolu kullanabilir. Bu ay yaklaşık {used} GB / {limit} GB kullanıldı.',
    turnOverLimit: 'Bu ayın sınırı doldu ({used} GB / {limit} GB). Yedek yol gelecek aya kadar ya da sınırı yükseltene kadar kapalı.',
    turnHideIp: "Bu bilgisayarın IP adresini internetten bağlanan cihazlardan gizle (her zaman yedek yolu kullanırlar)",
    turnLimit: 'Aylık sınır (GB):',
    turnLimitTitle: 'Yedek yol: bu ayın sınırı doldu',
    'turn-missing': 'Turn Token ID ve API Token değerlerinin ikisini de yapıştır.',
    'turn-rejected': 'Cloudflare bu Turn Token ID ve API Token değerlerini kabul etmedi.',
    'turn-unreachable': "Cloudflare'e ulaşılamadı. İnternet bağlantısını kontrol edip tekrar dene.",
    'turn-no-encryption': "Windows bu bilgisayarda token'ı güvenle saklayamıyor, bu yüzden kaydedilmedi.",
    relayTag: 'yedek yol',
    historyEmpty: 'Henüz bir şey yok.',
    historyClear: 'Geçmişi temizle',
    historyClearAsk: 'Tüm bağlantı geçmişi silinsin mi?',
    histJoined: '{who} bağlandı ({via})',
    histLeft: '{who} ayrıldı ({time} kaldı)',
    histAllowed: '{who} için izin verdin',
    histDenied: '{who} reddedildi',
    histKicked: '{who} bağlantısını kestin',
    histProofFailed: '{who} hatırlanan cihaz olduğunu kanıtlayamadı, bağlantısı kesildi',
    histPinWrong: '{who} yanlış PIN girdi',
    histPinLocked: '{who} çok fazla yanlış PIN girdi, 15 dakika kilitlendi',
    histRemoteFailed: '{who} paylaşımı başlatamadı',
    histRecording: '{who} kaydetmeye başladı',
    histTalking: '{who} mikrofonu açtı',
    durShort: '1 dakikadan az',
    durMin: '{m} dk',
    durHour: '{h} sa {m} dk',
    canControl: 'Kontrol edebilir',
    canControlHint: 'Paylaşım sırasında bu cihaz, Kontrolü aç\'a basmadan fareyi ve klavyeyi kullanabilir. Ctrl+Alt+K durdurur.',
    controlTag: 'kontrol edebilir',
    controlHintDevices: '"Kontrol edebilir" işaretlediğin cihazlar bu bilgisayarın faresini ve klavyesini kullanabilir. Acil kapatma: Ctrl+Alt+K',
    remoteStarted: '{who} paylaşımı başlattı.',
    remoteStopped: '{who} paylaşımı durdurdu.',
    remoteStartFailed: '{who} paylaşımı başlatamadı: ',
    remoteStarting: 'Başlatılıyor…',
    recordingTitle: 'Bir cihaz yayını kaydediyor',
    recordingTag: 'kaydediyor',
    talkingTag: 'mikrofon açık',
    record: 'Kayıt',
    recordStop: 'Kaydı bitir',
    recordFailed: 'Bu cihazda kayıt başlatılamadı.',
    recordSaved: 'Kayıt hazır. Saklamak için Kaydet\'e dokun.',
    micOn: 'Konuş',
    micOff: 'Mikrofonu kapat',
    micStarting: 'Mikrofon…',
    micLive: 'Mikrofonun bilgisayarda çalıyor.',
    micNeedsHttps: 'Mikrofon yalnızca Ayva https ile açıldığında çalışır (sabit adres ya da internet linki); ev ağı adresinde çalışmaz.',
    micBlocked: 'Mikrofon izni verilmedi.',
    micFailed: 'Mikrofon bağlanamadı.',
    micRefused: 'Bilgisayar mikrofonu yalnızca hatırlanan cihazlardan ya da uzaktan kontrol açıkken kabul ediyor.',
  },
};

var LANG = (navigator.language || 'en').toLowerCase().indexOf('tr') === 0 ? 'tr' : 'en';

function t(key) {
  return STRINGS[LANG][key] || STRINGS.en[key] || key;
}

function applyStrings() {
  document.documentElement.lang = LANG;
  var nodes = document.querySelectorAll('[data-i18n]');
  for (var i = 0; i < nodes.length; i++) {
    nodes[i].textContent = t(nodes[i].getAttribute('data-i18n'));
  }
  var inputs = document.querySelectorAll('[data-i18n-placeholder]');
  for (var j = 0; j < inputs.length; j++) {
    inputs[j].placeholder = t(inputs[j].getAttribute('data-i18n-placeholder'));
  }
}

function $(id) {
  return document.getElementById(id);
}

function storageGet(key) {
  try {
    return localStorage.getItem(key);
  } catch (e) {
    return null;
  }
}

function storageSet(key, value) {
  try {
    localStorage.setItem(key, value);
  } catch (e) {}
}

function loadConfig() {
  return fetch('/config.json')
    .then(function (r) { return r.json(); })
    .catch(function () {
      return { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] };
    });
}

// WebRTC tunes Opus for voice calls (mono, ~32 kbps), which makes music and
// film sound harsh. Ask for stereo at a high bitrate instead. Both sides apply
// this: the fmtp parameters say what the *receiving* side wants.
var OPUS_PARAMS = { stereo: 1, 'sprop-stereo': 1, maxaveragebitrate: 256000, useinbandfec: 1, usedtx: 0 };

function tuneOpus(sdp) {
  var match = sdp.match(/a=rtpmap:(\d+) opus\/48000\/2/i);
  if (!match) return sdp;
  var pt = match[1];
  var fmtp = new RegExp('a=fmtp:' + pt + ' ([^\\r\\n]*)');
  var existing = sdp.match(fmtp);
  var params = {};
  if (existing) {
    existing[1].split(';').forEach(function (kv) {
      var parts = kv.trim().split('=');
      if (parts[0]) params[parts[0]] = parts[1];
    });
  }
  for (var k in OPUS_PARAMS) params[k] = OPUS_PARAMS[k];
  var line = 'a=fmtp:' + pt + ' ' + Object.keys(params).map(function (k) { return k + '=' + params[k]; }).join(';');
  if (existing) return sdp.replace(fmtp, line);
  return sdp.replace(match[0], match[0] + '\r\n' + line);
}

// ICE candidates can arrive before the remote description they belong to;
// hold them until it is set (call flushCandidates right after).
function addCandidate(pc, candidate) {
  if (pc.remoteDescription) {
    pc.addIceCandidate(candidate).catch(function () {});
    return;
  }
  pc.pendingCandidates = pc.pendingCandidates || [];
  pc.pendingCandidates.push(candidate);
}

function flushCandidates(pc) {
  (pc.pendingCandidates || []).forEach(function (c) { pc.addIceCandidate(c).catch(function () {}); });
  pc.pendingCandidates = [];
}

// ---- File and clipboard transfer over a WebRTC data channel ----
// Messages are JSON strings, except file contents, which are sent as binary
// chunks between a "file-start" and a "file-end" message. One file at a time.
// handlers: { message(msg), fileStart(meta), fileChunk(meta, arrayBuffer), fileEnd(meta) }

var CHUNK_SIZE = 64 * 1024;
var MAX_BUFFERED = 4 * 1024 * 1024;

function Transfer(dc, handlers) {
  var self = this;
  self.dc = dc;
  self.queue = Promise.resolve();
  self.incoming = null;
  dc.binaryType = 'arraybuffer';
  dc.bufferedAmountLowThreshold = 1024 * 1024;
  dc.onmessage = function (e) {
    if (typeof e.data !== 'string') {
      if (self.incoming) {
        self.incoming.received += e.data.byteLength;
        if (handlers.fileChunk) handlers.fileChunk(self.incoming, e.data);
      }
      return;
    }
    var msg;
    try { msg = JSON.parse(e.data); } catch (err) { return; }
    if (msg.t === 'file-start') {
      msg.received = 0;
      self.incoming = msg;
      if (handlers.fileStart) handlers.fileStart(msg);
    } else if (msg.t === 'file-end') {
      var meta = self.incoming;
      self.incoming = null;
      if (meta && handlers.fileEnd) handlers.fileEnd(meta);
    } else if (handlers.message) {
      handlers.message(msg);
    }
  };
}

Transfer.prototype.send = function (msg) {
  if (this.dc.readyState === 'open') this.dc.send(JSON.stringify(msg));
};

// Queues a file; onProgress(fraction). Resolves when it has been handed to the channel.
Transfer.prototype.sendFile = function (file, onProgress) {
  var self = this;
  // A failed file must not block the ones queued after it.
  self.queue = self.queue.catch(function () {}).then(function () { return self.sendNow(file, onProgress); });
  return self.queue;
};

Transfer.prototype.sendNow = function (file, onProgress) {
  var dc = this.dc;
  var self = this;
  var offset = 0;
  self.send({ t: 'file-start', name: file.name, size: file.size, type: file.type || '' });

  function waitForRoom() {
    if (dc.bufferedAmount <= MAX_BUFFERED) return Promise.resolve();
    return new Promise(function (resolve) {
      dc.onbufferedamountlow = function () {
        dc.onbufferedamountlow = null;
        resolve();
      };
    });
  }

  function next() {
    if (dc.readyState !== 'open') return Promise.reject(new Error('closed'));
    if (offset >= file.size) {
      self.send({ t: 'file-end' });
      if (onProgress) onProgress(1);
      return Promise.resolve();
    }
    return waitForRoom()
      .then(function () { return file.slice(offset, offset + CHUNK_SIZE).arrayBuffer(); })
      .then(function (buf) {
        dc.send(buf);
        offset += buf.byteLength;
        if (onProgress) onProgress(offset / file.size);
        return next();
      });
  }
  return next();
};

// Copies text; works on plain http too (where navigator.clipboard is missing).
function copyText(text) {
  if (navigator.clipboard && window.isSecureContext) return navigator.clipboard.writeText(text);
  var area = document.createElement('textarea');
  area.value = text;
  area.style.position = 'fixed';
  area.style.opacity = '0';
  document.body.appendChild(area);
  area.select();
  var ok = document.execCommand('copy');
  document.body.removeChild(area);
  return ok ? Promise.resolve() : Promise.reject(new Error('copy failed'));
}

function formatSize(bytes) {
  if (bytes < 1024 * 1024) return Math.max(1, Math.round(bytes / 1024)) + ' KB';
  if (bytes < 1024 * 1024 * 1024) return (bytes / 1024 / 1024).toFixed(1) + ' MB';
  return (bytes / 1024 / 1024 / 1024).toFixed(2) + ' GB';
}

// WebSocket to the signaling server that reconnects by itself.
// handlers: { open(), message(msg), close(), url (optional; default: this page's server) }
function Signal(handlers) {
  var self = this;
  self.ws = null;
  self.handlers = handlers;

  function connect() {
    var proto = location.protocol === 'https:' ? 'wss://' : 'ws://';
    var ws = new WebSocket(handlers.url || proto + location.host);
    self.ws = ws;
    ws.onopen = function () {
      // Keep idle connections alive through proxies and NATs.
      var ping = setInterval(function () {
        if (ws.readyState === WebSocket.OPEN) ws.send('ping');
        else clearInterval(ping);
      }, 30000);
      handlers.open();
    };
    ws.onmessage = function (e) {
      var msg;
      try { msg = JSON.parse(e.data); } catch (err) { return; }
      handlers.message(msg);
    };
    ws.onclose = function () {
      handlers.close();
      if (!self.stopped) setTimeout(connect, 2000);
    };
  }
  connect();
}

Signal.prototype.send = function (msg) {
  if (this.ws && this.ws.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(msg));
};

// Closes for good (no reconnect).
Signal.prototype.stop = function () {
  this.stopped = true;
  if (this.ws) this.ws.close();
};

applyStrings();
