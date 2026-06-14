// ==UserScript==
// @name         Sound Pack Robust Mute Fix
// @version      1.0
// @description  Robust mute fix that works with any timing
// @match        https://www.geo-fs.com/geofs.php*
// @match        https://beta.geo-fs.com/geofs.php
// @run-at       document-end
// @grant        none
// ==/UserScript==

(function() {
    'use strict';

    console.log('[B777 Mute Fix] Starting robust initialization...');

    let fixApplied = false;
    let attempts = 0;
    const maxAttempts = 60; // 30 seconds max wait

    // Multiple detection methods
    function isMainScriptReady() {
        return (
            typeof window.applyEffectiveMute === 'function' ||
            typeof window._GE90_audioCtx !== 'undefined' ||
            typeof window.GE90_layers !== 'undefined' ||
            (window.geofs && window.geofs.aircraft && window.geofs.aircraft.instance) ||
            document.querySelector('[src*="B777"]') !== null
        );
    }

    // Apply the fix with multiple fallback strategies
    function applyMuteFix() {
        if (fixApplied) return;

        attempts++;

        try {
            console.log(`[B777 Mute Fix] Attempt ${attempts} to apply fix...`);

            // Add persistent mute state
            window._GE90_persistentlyMuted = false;

            // Force mute all HTML5 audio elements
            function forceMuteAllAudio() {
                const audioElements = document.querySelectorAll('audio');
                audioElements.forEach(audio => {
                    audio.muted = true;
                    audio.volume = 0;

                    // Override play method to prevent audio from playing
                    if (!audio._geofsMutePatched) {
                        const originalPlay = audio.play;
                        audio.play = () => {
                            if (window._GE90_persistentlyMuted) {
                                return Promise.resolve();
                            }
                            audio.muted = false;
                            audio.volume = 1;
                            return originalPlay.call(audio);
                        };
                        audio._geofsMutePatched = true;
                    }
                });

                // Also force mute GeoFS sounds
                if (typeof geofs !== 'undefined' && geofs.sound && geofs.sound.sounds) {
                    Object.keys(geofs.sound.sounds).forEach(key => {
                        if (geofs.sound.sounds[key]) {
                            geofs.sound.sounds[key].volume = 0;
                            geofs.sound.sounds[key].muted = true;
                        }
                    });
                }
            }

            // Show mute indicator
            function showMuteIndicator() {
                const existing = document.getElementById('geofs-mute-indicator');
                if (existing) existing.remove();

                const indicator = document.createElement('div');
                indicator.id = 'geofs-mute-indicator';
                indicator.textContent = window._GE90_persistentlyMuted ? '🔇 MUTED' : '🔊 UNMUTED';
                indicator.style.cssText = `
                    position: fixed;
                    top: 110px;
                    right: 20px;
                    background: ${window._GE90_persistentlyMuted ? 'rgba(220, 53, 69, 0.9)' : 'rgba(40, 167, 69, 0.9)'};
                    color: white;
                    padding: 12px 20px;
                    border-radius: 8px;
                    font-size: 14px;
                    font-weight: bold;
                    z-index: 10000;
                    transition: opacity 0.3s;
                    box-shadow: 0 4px 12px rgba(0,0,0,0.3);
                    font-family: Arial, sans-serif;
                `;

                document.body.appendChild(indicator);

                setTimeout(() => {
                    if (indicator.parentNode) {
                        indicator.style.opacity = '0';
                        setTimeout(() => {
                            if (indicator.parentNode) {
                                indicator.parentNode.removeChild(indicator);
                            }
                        }, 300);
                    }
                }, 3000);
            }

            // Monitor for new audio elements
            function monitorAudioElements() {
                const observer = new MutationObserver((mutations) => {
                    mutations.forEach((mutation) => {
                        mutation.addedNodes.forEach((node) => {
                            if (node.tagName === 'AUDIO') {
                                if (window._GE90_persistentlyMuted) {
                                    node.muted = true;
                                    node.volume = 0;
                                }
                            }

                            if (node.querySelectorAll) {
                                const audioElements = node.querySelectorAll('audio');
                                audioElements.forEach(audio => {
                                    if (window._GE90_persistentlyMuted) {
                                        audio.muted = true;
                                        audio.volume = 0;
                                    }
                                });
                            }
                        });
                    });
                });

                observer.observe(document.body, {
                    childList: true,
                    subtree: true
                });
            }

            // Start audio monitoring
            monitorAudioElements();

            // Continuous monitoring to ensure mute stays active
            let muteMonitoringInterval = null;

            function startContinuousMuteMonitoring() {
                if (muteMonitoringInterval) return;

                muteMonitoringInterval = setInterval(() => {
                    if (window._GE90_persistentlyMuted) {
                        forceMuteAllAudio();
                    } else {
                        clearInterval(muteMonitoringInterval);
                        muteMonitoringInterval = null;
                    }
                }, 100);
            }

            // Create our own toggle functions if they don't exist
            if (typeof window.toggleMute !== 'function') {
                window.toggleMute = function() {
                    window._GE90_userMuted = !window._GE90_userMuted;
                    window._GE90_persistentlyMuted = window._GE90_userMuted;

                    showMuteIndicator();
                    startContinuousMuteMonitoring();

                    console.log("[B777 Mute Fix] standalone toggle mute:", window._GE90_userMuted);
                };

                console.log('[B777 Mute Fix] Created standalone toggleMute function');
            } else {
                // Enhance existing toggle function
                const originalToggleMute = window.toggleMute;
                window.toggleMute = function() {
                    window._GE90_userMuted = !window._GE90_userMuted;
                    window._GE90_persistentlyMuted = window._GE90_userMuted;

                    // Call original function if it exists
                    try {
                        originalToggleMute.call(this);
                    } catch (e) {
                        console.warn('[B777 Mute Fix] Original toggleMute failed:', e);
                    }

                    // Add our enhancements
                    showMuteIndicator();
                    startContinuousMuteMonitoring();

                    console.log("[B777 Mute Fix] enhanced toggle mute:", window._GE90_userMuted);
                };

                console.log('[B777 Mute Fix] Enhanced existing toggleMute function');
            }

            // Create our own togglePause function if it doesn't exist
            if (typeof window.togglePause !== 'function') {
                window.togglePause = function() {
                    window._GE90_paused = !window._GE90_paused;
                    window._GE90_persistentlyMuted = window._GE90_paused; // Sync with pause state

                    // Handle audio context suspension/resumption
                    try {
                        const ctx = window._GE90_audioCtx;
                        if (ctx) {
                            if (window._GE90_paused) {
                                ctx.suspend();
                            } else {
                                ctx.resume();
                            }
                        }
                    } catch (e) {
                        console.warn('[B777 Mute Fix] Audio context control failed:', e);
                    }

                    // Toggle GeoFS game pause state
                    try {
                        if (typeof geofs !== 'undefined') {
                            // Toggle the geofs.pause variable
                            geofs.pause = !geofs.pause;
                            console.log('[B777 Mute Fix] GeoFS pause state toggled to:', geofs.pause);
                        }
                    } catch (e) {
                        console.warn('[B777 Mute Fix] GeoFS pause control failed:', e);
                    }

                    // Apply mute changes
                    if (typeof window.applyEffectiveMute === 'function') {
                        try {
                            window.applyEffectiveMute();
                        } catch (e) {
                            console.warn('[B777 Mute Fix] applyEffectiveMute failed:', e);
                        }
                    }

                    // Add our enhancements
                    showMuteIndicator();
                    if (window._GE90_persistentlyMuted) {
                        startContinuousMuteMonitoring();
                    }

                    console.log("[B777 Mute Fix] standalone toggle pause:", window._GE90_paused);
                };

                console.log('[B777 Mute Fix] Created standalone togglePause function');
            } else {
                // Enhance existing togglePause function
                const originalTogglePause = window.togglePause;
                window.togglePause = function() {
                    window._GE90_paused = !window._GE90_paused;
                    window._GE90_persistentlyMuted = window._GE90_paused; // Sync with pause state

                    // Call original function if it exists
                    try {
                        originalTogglePause.call(this);
                    } catch (e) {
                        console.warn('[B777 Mute Fix] Original togglePause failed:', e);
                    }

                    // Toggle GeoFS game pause state
                    try {
                        if (typeof geofs !== 'undefined') {
                            // Toggle the geofs.pause variable
                            geofs.pause = !geofs.pause;
                            console.log('[B777 Mute Fix] GeoFS pause state toggled to:', geofs.pause);
                        }
                    } catch (e) {
                        console.warn('[B777 Mute Fix] GeoFS pause control failed:', e);
                    }

                    // Add our enhancements
                    showMuteIndicator();
                    if (window._GE90_persistentlyMuted) {
                        startContinuousMuteMonitoring();
                    }

                    console.log("[B777 Mute Fix] enhanced toggle pause:", window._GE90_paused);
                };

                console.log('[B777 Mute Fix] Enhanced existing togglePause function');
            }

            // Override keyboard controls
           // Override keyboard controls (replace existing setupKeyboardControls implementation)
function setupKeyboardControls() {
    // Remove existing listener if present
    try {
        if (window._geofsKeyListener) {
            document.removeEventListener('keydown', window._geofsKeyListener, true);
            window._geofsKeyListener = null;
        }
    } catch (e) {
        console.warn('[B777 Mute Fix] Failed to remove previous key listener:', e);
    }

    // Helper: determine whether an element is a typing target
    function isTypingElement(el) {
        if (!el) return false;
        // If element is the document or body, not typing
        if (el === document || el === document.body) return false;
        const tag = (el.tagName || '').toUpperCase();
        if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true;
        // Some inputs are role=textbox etc.
        const role = el.getAttribute && el.getAttribute('role');
        if (role === 'textbox' || role === 'search' || role === 'combobox') return true;
        // contenteditable
        if (el.isContentEditable) return true;
        return false;
    }

    // Enhanced listener: ignore when typing or composing IME
    const enhancedListener = function(e) {
        try {
            // If IME composition is active, ignore shortcuts
            if (e.isComposing || (typeof e.key === 'string' && e.key === 'Process')) {
                return;
            }

            // If focus is inside an editable element, do nothing
            const target = e.target || document.activeElement;
            if (isTypingElement(target) || isTypingElement(document.activeElement)) {
                return;
            }

            // Optionally ignore when modifier keys are held (so Ctrl+S etc. still work for browser)
            if (e.ctrlKey || e.metaKey || e.altKey) {
                return;
            }

            // Now handle single-key shortcuts
            const k = e.key;
            if (k === 's' || k === 'S') {
                e.preventDefault();
                e.stopPropagation();
                try { window.toggleMute && window.toggleMute(); } catch (err) { console.warn('[B777 Mute Fix] toggleMute error', err); }
            } else if (k === 'p' || k === 'P') {
                e.preventDefault();
                e.stopPropagation();
                try { if (typeof window.togglePause === 'function') window.togglePause(); } catch (err) { console.warn('[B777 Mute Fix] togglePause error', err); }
            }
        } catch (error) {
            console.warn('[B777 Mute Fix] Keyboard control error:', error);
        }
    };

    // Attach with capture to match original behavior
    document.addEventListener('keydown', enhancedListener, true);
    window._geofsKeyListener = enhancedListener;

    console.log('[B777 Mute Fix] Keyboard controls setup complete (typing-aware)');
}

            // Setup keyboard controls
            setupKeyboardControls();

            // Initialize user states
            if (typeof window._GE90_userMuted === 'undefined') {
                window._GE90_userMuted = false;
            }
            if (typeof window._GE90_paused === 'undefined') {
                window._GE90_paused = false;
            }
// -----------------------------
// Auto-reinstall Proxy + immediate restore hooks (no overlay UI)
// Replace previous pause/instance/registry watcher with this block
// -----------------------------
(function(){
  const PAUSE_POLL_MS = 150;
  const INSTANCE_POLL_MS = 140;
  const IDENTITY_POLL_MS = 120;
  const REGISTRY_POLL_MS = 120;
  const MAX_RETRY_ATTEMPTS = 8;

  let _lastGeofsPause = null;
  let _pauseWatcherInterval = null;
  let _instanceWatcherInterval = null;
  let _identityWatcherInterval = null;
  let _registryWatcherInterval = null;
  let _lastInstId = null;
  let _lastRegistryObj = null;
  let _savedVolumes = {};
  let _prePauseUserMuted = false;
  let _wrappedCreators = [];
  let _proxyInstalled = false;

  // lightweight debug function (no UI)
  function _dbg(msg){
    try { window._GE90_lastAction = { msg, ts: Date.now() }; } catch(e){}
  }

  function _getAudioCtx(){ return window._GE90_audioCtx || window.audioContext || window.ctx || null; }
  function _safeResumeCtx(){ try { const c=_getAudioCtx(); if (c && typeof c.resume==='function') c.resume().catch(()=>{}); } catch(e){} }
  function _safeSuspendCtx(){ try { const c=_getAudioCtx(); if (c && typeof c.suspend==='function') c.suspend().catch(()=>{}); } catch(e){} }

  // snapshot volumes before muting
  function _snapshotGeofsVolumes(){
    try {
      if (typeof geofs !== 'undefined' && geofs.sound && geofs.sound.sounds) {
        Object.keys(geofs.sound.sounds).forEach(k=>{
          try {
            const s = geofs.sound.sounds[k];
            if (s && typeof s.volume === 'number') _savedVolumes[k] = s.volume;
          } catch(e){}
        });
      }
    } catch(e){}
  }

  // force mute everything
  function _forceMuteAll(){
    try {
      document.querySelectorAll('audio').forEach(a => { try { a._GE90_savedVolume = a.volume || 1; a.muted = true; a.volume = 0; } catch(e){} });
      if (typeof geofs !== 'undefined' && geofs.sound && geofs.sound.sounds) {
        Object.keys(geofs.sound.sounds).forEach(k=>{
          try {
            const s = geofs.sound.sounds[k];
            if (s) { s._GE90_savedVolume = (typeof s.volume === 'number') ? s.volume : (s._GE90_savedVolume || 1); s.volume = 0; s.muted = true; }
          } catch(e){}
        });
      }
      try {
        if (geofs && geofs.sound && typeof geofs.sound.setMasterVolume === 'function') geofs.sound.setMasterVolume(0);
        else if (geofs && geofs.sound && geofs.sound.masterGain && geofs.sound.masterGain.gain) {
          try { geofs.sound.masterGain.gain.setValueAtTime(0, (_getAudioCtx() && _getAudioCtx().currentTime) || 0); } catch(e){}
        }
      } catch(e){}
    } catch(e){}
    _dbg('forceMuteAll');
  }

  // immediate restore (fast)
  function _immediateRestore(){
    try {
      _dbg('immediateRestore');
      _safeResumeCtx();
      document.querySelectorAll('audio').forEach(a=>{
        try {
          if (!window._GE90_persistentlyMuted && !window._GE90_userMuted) {
            a.muted = false;
            a.volume = (typeof a._GE90_savedVolume === 'number') ? a._GE90_savedVolume : (a.volume || 1);
          }
        } catch(e){}
      });

      if (typeof geofs !== 'undefined' && geofs.sound && geofs.sound.sounds) {
        Object.keys(geofs.sound.sounds).forEach(k=>{
          try {
            const s = geofs.sound.sounds[k];
            if (!s) return;
            if (!window._GE90_persistentlyMuted && !window._GE90_userMuted) {
              if (typeof _savedVolumes[k] === 'number') s.volume = _savedVolumes[k];
              else if (typeof s._GE90_savedVolume === 'number') s.volume = s._GE90_savedVolume;
              else if (typeof s.volume !== 'number' || s.volume === 0) s.volume = 1;
              s.muted = false;
            }
          } catch(e){}
        });
        try {
          if (typeof geofs.sound.setMasterVolume === 'function') {
            if (!window._GE90_persistentlyMuted && !window._GE90_userMuted) geofs.sound.setMasterVolume(1);
          } else if (geofs.sound.masterGain && geofs.sound.masterGain.gain) {
            if (!window._GE90_persistentlyMuted && !window._GE90_userMuted) {
              try { geofs.sound.masterGain.gain.setValueAtTime(1, (_getAudioCtx() && _getAudioCtx().currentTime) || 0); } catch(e){}
            }
          }
        } catch(e){}
      }
    } catch(e){ console.warn('[B777 Mute Fix] immediateRestore error', e); }
  }

  // short retry wrapper
  function _restoreWithRetries(maxAttempts = MAX_RETRY_ATTEMPTS){
    _immediateRestore();
    let attempt = 0;
    const tryOnce = () => {
      attempt++;
      try {
        _immediateRestore();
        const ctx = _getAudioCtx();
        const ctxOk = ctx ? (typeof ctx.state === 'string' ? ctx.state !== 'suspended' : true) : true;
        let anySoundNonZero = false;
        try {
          if (typeof geofs !== 'undefined' && geofs.sound && geofs.sound.sounds) {
            anySoundNonZero = Object.keys(geofs.sound.sounds).some(k=>{
              try { const s = geofs.sound.sounds[k]; return s && typeof s.volume === 'number' && s.volume > 0.001; } catch(e){ return false; }
            });
          }
        } catch(e){}
        if (ctxOk && anySoundNonZero) { _dbg('restoreSuccess'); return; }
      } catch(e){ console.warn('[B777 Mute Fix] retry restore error', e); }
      if (attempt < maxAttempts) {
        const delay = Math.min(1200, 60 * Math.pow(2, attempt));
        setTimeout(tryOnce, delay);
      } else {
        _dbg('restoreFailed');
      }
    };
    setTimeout(tryOnce, 120);
  }

  // Proxy installer for geofs.sound.sounds
  function _installSoundsProxy(){
    try {
      if (!window.geofs || !geofs.sound) return;
      const registry = geofs.sound.sounds;
      if (!registry) return;
      if (_proxyInstalled && registry === _lastRegistryObj) return;
      _lastRegistryObj = registry;
      if (registry && registry._GE90_isProxy) { _proxyInstalled = true; return; }

      const handler = {
        set(target, prop, value) {
          try {
            target[prop] = value;
            if (value && typeof value === 'object') {
              try {
                if (typeof _savedVolumes[prop] === 'number') value.volume = _savedVolumes[prop];
                else if (typeof value._GE90_savedVolume === 'number') value.volume = value._GE90_savedVolume;
                else if (!window._GE90_persistentlyMuted && !window._GE90_userMuted && (typeof value.volume !== 'number' || value.volume === 0)) value.volume = 1;
                value.muted = !!window._GE90_persistentlyMuted || !!window._GE90_userMuted;
                _dbg('proxyPatched:' + String(prop));
              } catch(e){}
            }
          } catch(e){}
          return true;
        },
        defineProperty(target, prop, descriptor) {
          try {
            Object.defineProperty(target, prop, descriptor);
            if (descriptor && 'value' in descriptor && descriptor.value && typeof descriptor.value === 'object') {
              const v = descriptor.value;
              if (typeof _savedVolumes[prop] === 'number') v.volume = _savedVolumes[prop];
              else if (typeof v._GE90_savedVolume === 'number') v.volume = v._GE90_savedVolume;
              else if (!window._GE90_persistentlyMuted && !window._GE90_userMuted && (typeof v.volume !== 'number' || v.volume === 0)) v.volume = 1;
              v.muted = !!window._GE90_persistentlyMuted || !!window._GE90_userMuted;
              _dbg('proxyDefinePatched:' + String(prop));
            }
          } catch(e){}
          return true;
        }
      };

      const proxy = new Proxy(registry, handler);
      proxy._GE90_isProxy = true;
      geofs.sound.sounds = proxy;
      _proxyInstalled = true;
      _dbg('proxyInstalled');
    } catch(e){ console.warn('[B777 Mute Fix] installSoundsProxy error', e); }
  }

  // Wrap likely sound creation functions
  function _wrapSoundCreators(){
    try {
      if (!window.geofs || !geofs.sound) return;
      const candidates = Object.keys(geofs.sound).sort();
      const likely = ['addSound','createSound','loadSound','registerSound','create','add','load'];
      const toWrap = candidates.filter(n => likely.includes(n) || /sound|create|add|load/i.test(n));
      toWrap.forEach(name=>{
        try {
          if (typeof geofs.sound[name] === 'function' && !_wrappedCreators.includes(name)) {
            const original = geofs.sound[name];
            geofs.sound[name] = function(...args){
              const res = original.apply(this, args);
              try {
                if (res && typeof res === 'object') {
                  const key = res.key || res.id || (args && args[0]) || null;
                  if (key && typeof _savedVolumes[key] === 'number') res.volume = _savedVolumes[key];
                  else if (typeof res._GE90_savedVolume === 'number') res.volume = res._GE90_savedVolume;
                  else if (!window._GE90_persistentlyMuted && !window._GE90_userMuted && (typeof res.volume !== 'number' || res.volume === 0)) res.volume = 1;
                  res.muted = !!window._GE90_persistentlyMuted || !!window._GE90_userMuted;
                }
              } catch(e){}
              _dbg('wrappedCreator:' + name);
              return res;
            };
            _wrappedCreators.push(name);
          }
        } catch(e){}
      });
    } catch(e){}
  }

  // Fallback registry poll to detect replacement quickly
  function _startIdentityWatcher(){
    if (_identityWatcherInterval) return;
    _identityWatcherInterval = setInterval(()=>{
      try {
        if (!window.geofs || !geofs.sound) return;
        const current = geofs.sound.sounds;
        if (!current) return;
        if (_lastRegistryObj === null) { _lastRegistryObj = current; _installSoundsProxy(); return; }
        if (current !== _lastRegistryObj) {
          _lastRegistryObj = current;
          _proxyInstalled = false;
          _installSoundsProxy();
          _wrapSoundCreators();
          _dbg('registryReplaced - proxyReinstalled');
        }
      } catch(e){}
    }, IDENTITY_POLL_MS);
  }

  // Registry fallback poll to ensure proxy and wrappers are present
  function _startRegistryFallback(){
    if (_registryWatcherInterval) return;
    _registryWatcherInterval = setInterval(()=>{
      try {
        if (typeof geofs !== 'undefined' && geofs.sound) {
          _installSoundsProxy();
          _wrapSoundCreators();
        }
      } catch(e){}
    }, REGISTRY_POLL_MS);
  }

  function _stopAllWatchers(){
    try { if (_pauseWatcherInterval) clearInterval(_pauseWatcherInterval); _pauseWatcherInterval = null; } catch(e){}
    try { if (_instanceWatcherInterval) clearInterval(_instanceWatcherInterval); _instanceWatcherInterval = null; } catch(e){}
    try { if (_identityWatcherInterval) clearInterval(_identityWatcherInterval); _identityWatcherInterval = null; } catch(e){}
    try { if (_registryWatcherInterval) clearInterval(_registryWatcherInterval); _registryWatcherInterval = null; } catch(e){}
  }

  // Apply pause/unpause
  function _applyPause(pauseState){
    try {
      if (pauseState) {
        _prePauseUserMuted = !!window._GE90_userMuted;
        window._GE90_persistentlyMuted = true;
        window._GE90_userMuted = true;
        _snapshotGeofsVolumes();
        _forceMuteAll();
        _safeSuspendCtx();
        _dbg('appliedPause');
      } else {
        window._GE90_userMuted = !!_prePauseUserMuted;
        window._GE90_persistentlyMuted = !!_prePauseUserMuted;
        _dbg('unpauseRequested');
        _installSoundsProxy();
        _wrapSoundCreators();
        _immediateRestore();
        _restoreWithRetries(6);
        _startRegistryFallback();
      }
    } catch(e){ console.warn('[B777 Mute Fix] applyPause error', e); }
  }

  // Watchers for pause and instance changes and events
  function _startPauseWatcher(){
    if (_pauseWatcherInterval) return;
    try {
      if (window.geofs && window.geofs.events && typeof window.geofs.events.on === 'function') {
        try { window.geofs.events.on('pause', function(val){ _lastGeofsPause = !!val; _applyPause(_lastGeofsPause); }); } catch(e){}
        try { window.geofs.events.on('state', function(s){ if (s && typeof s.pause !== 'undefined') { _lastGeofsPause = !!s.pause; _applyPause(_lastGeofsPause); } }); } catch(e){}
        try { window.geofs.events.on('spawn', function(){ setTimeout(()=>{ _immediateRestore(); _restoreWithRetries(4); }, 120); }); } catch(e){}
        try { window.geofs.events.on('aircraft:spawn', function(){ setTimeout(()=>{ _immediateRestore(); _restoreWithRetries(4); }, 120); }); } catch(e){}
        try { window.geofs.events.on('aircraft:created', function(){ setTimeout(()=>{ _immediateRestore(); _restoreWithRetries(4); }, 120); }); } catch(e){}
      }
    } catch(e){}
    _lastGeofsPause = (typeof geofs !== 'undefined') ? !!geofs.pause : null;
    _pauseWatcherInterval = setInterval(()=>{
      try {
        const p = (typeof geofs !== 'undefined') ? !!geofs.pause : null;
        if (p === null) return;
        if (_lastGeofsPause === null) { _lastGeofsPause = p; _applyPause(p); return; }
        if (p !== _lastGeofsPause) { _lastGeofsPause = p; _applyPause(p); }
      } catch(e){ console.warn('[B777 Mute Fix] pause watcher error', e); }
    }, PAUSE_POLL_MS);
  }

  function _startInstanceWatcher(){
    if (_instanceWatcherInterval) return;
    _lastInstId = null;
    _instanceWatcherInterval = setInterval(()=>{
      try {
        const inst = (window.geofs && geofs.aircraft && geofs.aircraft.instance) ? geofs.aircraft.instance : null;
        if (!inst) return;
        const id = inst.id || inst.model || inst._instanceId || inst._uniqueId || inst;
        if (_lastInstId === null) { _lastInstId = id; return; }
        if (id !== _lastInstId) {
          _lastInstId = id;
          const paused = (typeof geofs !== 'undefined') ? !!geofs.pause : null;
          if (paused === false) {
            _dbg('instanceChanged - immediateRestore');
            _installSoundsProxy();
            _wrapSoundCreators();
            _immediateRestore();
            _restoreWithRetries(6);
            _startRegistryFallback();
          }
        }
      } catch(e){}
    }, INSTANCE_POLL_MS);
  }

  // Right-click (map spawn) detector: schedule immediate restore after contextmenu
  function _installContextmenuHook(){
    try {
      document.addEventListener('contextmenu', (ev)=>{
        try {
          setTimeout(()=>{ _immediateRestore(); _restoreWithRetries(4); }, 160);
        } catch(e){}
      }, true);
    } catch(e){}
  }

  // Start everything
  try {
    setTimeout(()=>{
      _startPauseWatcher();
      _startInstanceWatcher();
      _startIdentityWatcher();
      _installSoundsProxy();
      _wrapSoundCreators();
      _startRegistryFallback();
      _installContextmenuHook();
    }, 300);
    if (typeof window.geofs !== 'undefined') {
      _startPauseWatcher();
      _startInstanceWatcher();
      _startIdentityWatcher();
      _installSoundsProxy();
      _wrapSoundCreators();
      _startRegistryFallback();
      _installContextmenuHook();
    }
    _dbg('pauseSyncInit');
  } catch(e){ console.warn('[B777 Mute Fix] failed to start watchers', e); }

  // Expose controls
  window._GE90_pauseSync = window._GE90_pauseSync || {};
  Object.assign(window._GE90_pauseSync, {
    start: function(){ _startPauseWatcher(); _startInstanceWatcher(); _startIdentityWatcher(); _startRegistryFallback(); },
    stop: _stopAllWatchers,
    restoreNow: function(){ _immediateRestore(); _restoreWithRetries(); },
    savedVolumes: _savedVolumes
  });

  _dbg('pauseSyncInitComplete');
})();

            // Emergency functions
            window.emergencyMute = function() {
                console.log("[B777 Mute Fix] Emergency mute activated");
                window._GE90_persistentlyMuted = true;
                window._GE90_userMuted = true;
                forceMuteAllAudio();
                showMuteIndicator();
                startContinuousMuteMonitoring();
            };

            window.emergencyUnmute = function() {
                console.log("[B777 Mute Fix] Emergency unmute activated");
                window._GE90_persistentlyMuted = false;
                window._GE90_userMuted = false;
                showMuteIndicator();
                if (muteMonitoringInterval) {
                    clearInterval(muteMonitoringInterval);
                    muteMonitoringInterval = null;
                }
            };

            // Test the mute system
            setTimeout(() => {
                console.log('[B777 Mute Fix] Testing mute system...');
                window._GE90_persistentlyMuted = true;
                showMuteIndicator();
                setTimeout(() => {
                    window._GE90_persistentlyMuted = false;
                    showMuteIndicator();
                }, 1000);
            }, 2000);

            fixApplied = true;
            console.log('[B777 Mute Fix] Successfully applied!');

        } catch (error) {
            console.error('[B777 Mute Fix] Error applying fix:', error);
        }
    }

    // Wait for the main script with multiple strategies
    function waitForB777Script() {
        if (fixApplied) return;

        if (attempts >= maxAttempts) {
            console.warn('[B777 Mute Fix] Max attempts reached, applying anyway...');
            applyMuteFix();
            return;
        }

        if (isMainScriptReady()) {
            console.log('[B777 Mute Fix] Main script detected, applying fix...');
            applyMuteFix();
        } else {
            // Keep checking
            setTimeout(waitForB777Script, 500);
        }
    }

    // Also try to apply on DOM content loaded as fallback
    document.addEventListener('DOMContentLoaded', () => {
        setTimeout(() => {
            if (!fixApplied) {
                console.log('[B777 Mute Fix] DOM loaded fallback, applying fix...');
                applyMuteFix();
            }
        }, 2000);
    });

    // Start the waiting process
    waitForB777Script();

})();
