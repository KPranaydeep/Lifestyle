// content_script.js
// Content script: extracts visible page info and shows a local trust hint panel.
// Works without any network calls or external APIs.

(function () {
  const CLICKBAIT_WORDS = ['shocking','you won\'t believe','unbelievable','truth','exposed','won’t believe','must see','secret'];
  let currentUrl = location.href;

  // Run right away and also on SPA navigation (YouTube uses pushState)
  setupNavigationObserver();
  runAnalysis(); // initial

  function setupNavigationObserver() {
    // detect url changes in SPA
    const observer = new MutationObserver(() => {
      if (location.href !== currentUrl) {
        currentUrl = location.href;
        // only run on watch pages
        if (currentUrl.includes('watch')) {
          setTimeout(runAnalysis, 700); // small delay for content to render
        }
      }
    });
    observer.observe(document, {subtree: true, childList: true});
  }

  function runAnalysis() {
    try {
      const data = extractVisibleData();
      if (!data || !data.videoId) return;
      const verdict = computeHeuristics(data);
      showPanel(verdict, data);
    } catch (e) {
      console.error('TrustHint error', e);
    }
  }

  function extractVisibleData() {
    // video id from URL
    const urlParams = new URLSearchParams(location.search);
    const videoId = urlParams.get('v') || null;

    // title
    const titleEl = document.querySelector('h1.title yt-formatted-string') ||
                    document.querySelector('h1.title') ||
                    document.querySelector('meta[name="title"]');
    const title = titleEl ? (titleEl.textContent || titleEl.getAttribute('content') || '') : document.title || '';

    // description
    const descEl = document.querySelector('#description') || document.querySelector('#description yt-formatted-string');
    const description = descEl ? descEl.innerText.trim() : '';

    // channel name & subscriber count
    const channelEl = document.querySelector('ytd-channel-name a') ||
                      document.querySelector('#owner-name a') ||
                      document.querySelector('#channel-name a');
    const channel = channelEl ? channelEl.textContent.trim() : (document.querySelector('#channel-title')?.textContent?.trim() || '');

    const subEl = document.querySelector('#owner-sub-count') ||
                  document.querySelector('#owner-subcount') ||
                  document.querySelector('#subscriber-count yt-formatted-string') ||
                  document.querySelector('#owner-sub-count yt-formatted-string');
    const subscribers = subEl ? subEl.textContent.trim() : '';

    // visible transcript/captions (only what's exposed in DOM or video textTracks)
    let transcript = '';
    try {
      const video = document.querySelector('video');
      if (video && video.textTracks && video.textTracks.length) {
        for (let i = 0; i < video.textTracks.length; i++) {
          const tt = video.textTracks[i];
          try {
            if (tt && tt.cues && tt.cues.length) {
              for (let j = 0; j < tt.cues.length; j++) {
                transcript += tt.cues[j].text + ' ';
              }
            }
          } catch (e) { /* ignore */ }
        }
      }
    } catch (e) { /* ignore */ }

    // Also look for transcript text if the transcript panel is open
    try {
      const transcriptNodes = document.querySelectorAll('ytd-transcript-renderer .cue, .segment, .cue');
      if (transcriptNodes && transcriptNodes.length) {
        transcript = Array.from(transcriptNodes).map(n => n.innerText).join(' ');
      }
    } catch (e) {}

    // detect links in description (as signal of sources)
    const links = [];
    try {
      if (descEl) {
        descEl.querySelectorAll('a').forEach(a => {
          if (a.href) links.push(a.href);
        });
      }
    } catch (e) {}

    return { videoId, title, description, channel, subscribers, transcript: transcript.trim(), links };
  }

  function computeHeuristics(data) {
    // Simple scoring rules combining visible signals.
    // Score range: 0..100
    let score = 50;
    const reasons = [];

    // presence of explicit source links in description -> positive
    if (data.links && data.links.length > 0) {
      score += 18;
      reasons.push(`Description contains ${data.links.length} link(s) (sources)`);
    } else {
      reasons.push('No source links found in description');
      score -= 8;
    }

    // transcript presence -> positive
    if (data.transcript && data.transcript.split(' ').length > 20) {
      score += 12;
      reasons.push('Captions/transcript available');
    } else {
      score -= 6;
      reasons.push('No visible captions/transcript detected');
    }

    // long description -> positive (more transparency)
    if (data.description && data.description.length > 300) {
      score += 8;
      reasons.push('Long description (detailed)');
    }

    // title clickbait heuristics
    const titleLower = (data.title || '').toLowerCase();
    let clickbaitHits = 0;
    CLICKBAIT_WORDS.forEach(w => { if (titleLower.includes(w)) clickbaitHits++; });
    if (clickbaitHits > 0) {
      score -= 14;
      reasons.push(`Title contains potentially sensational phrases (${clickbaitHits})`);
    }
    // all-caps title penalty
    const letters = (data.title || '').replace(/[^A-Za-z]/g, '');
    if (letters && (data.title && (data.title === data.title.toUpperCase()) && letters.length > 6)) {
      score -= 10;
      reasons.push('Title is mostly ALL CAPS');
    }

    // many exclamation marks -> penalize
    const exclam = (data.title || '').split('!').length - 1;
    if (exclam >= 2) {
      score -= 6;
      reasons.push('Excessive exclamation marks in title');
    }

    // subscriber hint (visible small heuristic)
    if (data.subscribers) {
      const subsText = data.subscribers.replace(/[^\dKkM\.]/g, '').toLowerCase();
      // crude parse: e.g., "1.2M", "234K", or "123"
      let subsNumber = 0;
      try {
        if (subsText.endsWith('m')) subsNumber = parseFloat(subsText) * 1e6;
        else if (subsText.endsWith('k')) subsNumber = parseFloat(subsText) * 1e3;
        else subsNumber = parseInt(subsText) || 0;
      } catch (e) {}
      if (subsNumber > 100000) { score += 6; reasons.push('High subscriber count (signal of audience)'); }
      else if (subsNumber > 0 && subsNumber < 1000) { score -= 8; reasons.push('Low subscriber count (small channel)'); }
    }

    // clamp
    score = Math.max(0, Math.min(100, Math.round(score)));

    // map to simple label
    let label = 'Medium';
    if (score >= 72) label = 'High';
    else if (score <= 38) label = 'Low';

    return {score, label, reasons, data};
  }

  // UI: small badge + expandable panel
  function showPanel(verdict, data) {
    removeOldPanel();
    const panel = document.createElement('div');
    panel.id = 'trust-hint-panel';
    panel.style.position = 'fixed';
    panel.style.left = '12px';
    panel.style.top = '12px';
    panel.style.zIndex = 2147483647;
    panel.style.fontFamily = 'Arial, sans-serif';
    panel.style.minWidth = '120px';
    panel.style.maxWidth = '320px';
    panel.style.boxShadow = '0 2px 8px rgba(0,0,0,0.4)';
    panel.style.borderRadius = '8px';
    panel.style.overflow = 'hidden';
    panel.style.background = '#fff';
    panel.style.color = '#111';
    panel.style.border = '1px solid rgba(0,0,0,0.08)';

    const header = document.createElement('div');
    header.style.padding = '8px';
    header.style.display = 'flex';
    header.style.alignItems = 'center';
    header.style.justifyContent = 'space-between';
    header.style.gap = '8px';

    const left = document.createElement('div');
    left.style.display = 'flex';
    left.style.flexDirection = 'column';
    left.style.gap = '2px';

    const title = document.createElement('div');
    title.textContent = `Trust: ${verdict.label}`;
    title.style.fontWeight = '700';
    title.style.fontSize = '13px';

    const score = document.createElement('div');
    score.textContent = `${verdict.score}/100`;
    score.style.fontSize = '12px';
    score.style.color = '#666';

    left.appendChild(title);
    left.appendChild(score);

    const toggleBtn = document.createElement('button');
    toggleBtn.textContent = 'Details';
    toggleBtn.style.fontSize = '12px';
    toggleBtn.style.padding = '6px';
    toggleBtn.style.border = 'none';
    toggleBtn.style.background = '#0b5fff';
    toggleBtn.style.color = '#fff';
    toggleBtn.style.borderRadius = '6px';
    toggleBtn.style.cursor = 'pointer';

    header.appendChild(left);
    header.appendChild(toggleBtn);
    panel.appendChild(header);

    const details = document.createElement('div');
    details.style.display = 'none';
    details.style.padding = '8px';
    details.style.fontSize = '12px';
    details.style.lineHeight = '1.3';
    details.style.maxHeight = '420px';
    details.style.overflow = 'auto';

    // basic extracted info
    const infoList = document.createElement('div');
    infoList.innerHTML = `
      <div><strong>Title:</strong> ${escapeHtml(data.title || '')}</div>
      <div><strong>Channel:</strong> ${escapeHtml(data.channel || '')} ${data.subscribers ? '(' + escapeHtml(data.subscribers) + ')' : ''}</div>
      <div><strong>Sources in desc:</strong> ${data.links.length}</div>
      <div style="margin-top:6px"><strong>Reasons:</strong></div>
    `;
    details.appendChild(infoList);

    const reasonsUl = document.createElement('ul');
    reasonsUl.style.margin = '6px 0 0 18px';
    verdict.reasons.forEach(r => {
      const li = document.createElement('li');
      li.textContent = r;
      reasonsUl.appendChild(li);
    });
    details.appendChild(reasonsUl);

    if (data.links && data.links.length) {
      const linkBlock = document.createElement('div');
      linkBlock.style.marginTop = '8px';
      linkBlock.innerHTML = '<strong>Links found in description:</strong>';
      const ul = document.createElement('ul');
      ul.style.margin = '6px 0 0 18px';
      data.links.slice(0,6).forEach(href => {
        const li = document.createElement('li');
        const a = document.createElement('a');
        a.href = href;
        a.textContent = href.length > 40 ? href.slice(0,40) + '…' : href;
        a.target = '_blank';
        a.rel = 'noopener noreferrer';
        li.appendChild(a);
        ul.appendChild(li);
      });
      linkBlock.appendChild(ul);
      details.appendChild(linkBlock);
    }

    // transcript excerpt (if any)
    if (data.transcript) {
      const t = document.createElement('div');
      t.style.marginTop = '8px';
      t.innerHTML = `<strong>Transcript excerpt:</strong><div style="margin-top:6px; font-size:12px; color:#222">${escapeHtml(data.transcript.slice(0,500))}${data.transcript.length>500? '…':''}</div>`;
      details.appendChild(t);
    }

    panel.appendChild(details);

    toggleBtn.addEventListener('click', () => {
      details.style.display = details.style.display === 'none' ? 'block' : 'none';
    });

    // close when clicking outside
    document.body.addEventListener('click', outsideClick);
    function outsideClick(e) {
      if (!panel.contains(e.target)) {
        if (details.style.display === 'block') {
          // keep visible if expanded
          return;
        }
        panel.remove();
        document.body.removeEventListener('click', outsideClick);
      }
    }

    document.documentElement.appendChild(panel);
  }

  function removeOldPanel() {
    const old = document.getElementById('trust-hint-panel');
    if (old) old.remove();
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>\"]/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;' }[c]));
  }
})();
