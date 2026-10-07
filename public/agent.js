/**
 * NYVEN Website Widget — lightweight embeddable agent chat
 *
 * Usage:
 *   <script src="https://YOUR_HOST/agent.js" data-agent="AGENT_ID"></script>
 *
 * No API keys. No secrets. Talks only to NYVEN backend.
 */
;(function () {
  'use strict'

  if (window.__NYVEN_AGENT_LOADED__) return
  window.__NYVEN_AGENT_LOADED__ = true

  var script =
    document.currentScript ||
    (function () {
      var scripts = document.getElementsByTagName('script')
      for (var i = scripts.length - 1; i >= 0; i--) {
        if (scripts[i].src && scripts[i].src.indexOf('agent.js') !== -1) return scripts[i]
      }
      return null
    })()

  var agentId = (script && script.getAttribute('data-agent')) || ''
  if (!agentId) {
    console.warn('[NYVEN] data-agent attribute is required on the agent.js script tag.')
    return
  }

  var apiBase = ''
  if (script && script.src) {
    try {
      var u = new URL(script.src)
      apiBase = u.origin
    } catch (e) {
      apiBase = ''
    }
  }

  var sessionId = ''
  try {
    sessionId = localStorage.getItem('nyven_widget_session') || ''
    if (!sessionId) {
      sessionId =
        'sess_' +
        Date.now().toString(36) +
        '_' +
        Math.random().toString(36).slice(2, 10)
      localStorage.setItem('nyven_widget_session', sessionId)
    }
  } catch (e) {
    sessionId = 'sess_' + Date.now().toString(36)
  }

  var state = {
    open: false,
    loading: false,
    agent: null,
    paused: false,
    error: null,
    messages: [],
  }

  function el(tag, attrs, children) {
    var node = document.createElement(tag)
    if (attrs) {
      Object.keys(attrs).forEach(function (k) {
        if (k === 'style' && typeof attrs[k] === 'object') {
          Object.assign(node.style, attrs[k])
        } else if (k === 'className') {
          node.className = attrs[k]
        } else if (k.indexOf('on') === 0 && typeof attrs[k] === 'function') {
          node.addEventListener(k.slice(2).toLowerCase(), attrs[k])
        } else if (attrs[k] !== undefined && attrs[k] !== null) {
          node.setAttribute(k, attrs[k])
        }
      })
    }
    ;(children || []).forEach(function (c) {
      if (c == null) return
      if (typeof c === 'string') node.appendChild(document.createTextNode(c))
      else node.appendChild(c)
    })
    return node
  }

  function injectStyles() {
    if (document.getElementById('nyven-agent-styles')) return
    var css =
      '#nyven-agent-root{all:initial;font-family:Inter,system-ui,-apple-system,sans-serif;position:fixed;z-index:2147483000;bottom:20px;right:20px;color:#F5F7FA}' +
      '#nyven-agent-root *{box-sizing:border-box}' +
      '@media (prefers-reduced-motion:reduce){#nyven-agent-root *{transition:none!important;animation:none!important}}' +
      '.nyven-bubble{width:56px;height:56px;border-radius:16px;border:1px solid rgba(255,255,255,0.1);cursor:pointer;display:flex;align-items:center;justify-content:center;font-weight:600;font-size:18px;box-shadow:0 8px 32px rgba(0,0,0,0.35);transition:transform .2s ease,box-shadow .2s ease}' +
      '.nyven-bubble:hover{transform:translateY(-2px);box-shadow:0 12px 40px rgba(0,0,0,0.4)}' +
      '.nyven-panel{position:absolute;bottom:72px;right:0;width:min(380px,calc(100vw - 24px));height:min(560px,calc(100vh - 100px));background:#111722;border:1px solid rgba(255,255,255,0.08);border-radius:20px;display:flex;flex-direction:column;overflow:hidden;box-shadow:0 20px 60px rgba(0,0,0,0.45)}' +
      '.nyven-panel.hidden{display:none}' +
      '.nyven-header{padding:14px 16px;border-bottom:1px solid rgba(255,255,255,0.06);display:flex;align-items:center;gap:12px;background:#0D1118}' +
      '.nyven-avatar{width:36px;height:36px;border-radius:10px;display:flex;align-items:center;justify-content:center;font-weight:600;font-size:14px;border:1px solid rgba(255,255,255,0.1);flex-shrink:0}' +
      '.nyven-title{font-size:14px;font-weight:600;line-height:1.2}' +
      '.nyven-sub{font-size:11px;color:#8993A4;margin-top:2px;display:flex;align-items:center;gap:6px}' +
      '.nyven-dot{width:6px;height:6px;border-radius:50%;background:#34d399}' +
      '.nyven-dot.off{background:#8993A4}' +
      '.nyven-close{margin-left:auto;background:transparent;border:0;color:#8993A4;cursor:pointer;width:32px;height:32px;border-radius:8px;font-size:18px;line-height:1}' +
      '.nyven-close:hover{background:rgba(255,255,255,0.05);color:#F5F7FA}' +
      '.nyven-msgs{flex:1;overflow-y:auto;padding:16px;display:flex;flex-direction:column;gap:12px;background:#07090D}' +
      '.nyven-msg{max-width:88%;padding:10px 14px;border-radius:14px;font-size:13.5px;line-height:1.45;word-wrap:break-word;white-space:pre-wrap}' +
      '.nyven-msg.user{align-self:flex-end;background:rgba(98,230,255,0.12);border:1px solid rgba(98,230,255,0.2);color:#F5F7FA;border-bottom-right-radius:4px}' +
      '.nyven-msg.agent{align-self:flex-start;background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.08);color:#F5F7FA;border-bottom-left-radius:4px}' +
      '.nyven-msg.error{align-self:center;background:rgba(239,68,68,0.1);border:1px solid rgba(239,68,68,0.25);color:#fca5a5;font-size:12px}' +
      '.nyven-msg.thinking{opacity:0.7;font-style:italic}' +
      '.nyven-footer{padding:12px;border-top:1px solid rgba(255,255,255,0.06);background:#0D1118;display:flex;gap:8px}' +
      '.nyven-input{flex:1;background:#07090D;border:1px solid rgba(255,255,255,0.1);border-radius:12px;padding:10px 12px;color:#F5F7FA;font-size:13.5px;outline:none;resize:none;min-height:42px;max-height:100px;font-family:inherit}' +
      '.nyven-input:focus{border-color:rgba(98,230,255,0.4)}' +
      '.nyven-send{width:42px;height:42px;border-radius:12px;border:0;cursor:pointer;display:flex;align-items:center;justify-content:center;flex-shrink:0;color:#07090D;font-weight:700}' +
      '.nyven-send:disabled{opacity:0.45;cursor:not-allowed}' +
      '.nyven-brand{text-align:center;font-size:10px;color:#8993A4;padding:0 12px 10px;background:#0D1118}' +
      '.nyven-brand a{color:#62E6FF;text-decoration:none}' +
      '@media (max-width:480px){' +
      '#nyven-agent-root{bottom:12px;right:12px;left:12px}' +
      '.nyven-panel{position:fixed;left:12px;right:12px;bottom:12px;width:auto;height:min(70vh,560px);border-radius:18px}' +
      '.nyven-bubble{margin-left:auto}' +
      '}'

    var style = document.createElement('style')
    style.id = 'nyven-agent-styles'
    style.textContent = css
    document.head.appendChild(style)
  }

  function api(path, options) {
    return fetch(apiBase + path, options).then(function (res) {
      return res.json().then(function (data) {
        return { ok: res.ok, status: res.status, data: data }
      })
    })
  }

  function render() {
    var root = document.getElementById('nyven-agent-root')
    if (!root) return
    root.innerHTML = ''

    var color = (state.agent && state.agent.color) || '#62E6FF'
    var name = (state.agent && state.agent.name) || 'Support'
    var avatar = (state.agent && state.agent.avatar) || 'N'

    var bubble = el('button', {
      className: 'nyven-bubble',
      type: 'button',
      'aria-label': 'Open chat',
      style: { background: color + '22', color: color, borderColor: color + '44' },
      onClick: function () {
        state.open = !state.open
        render()
        if (state.open) scrollMsgs()
      },
    }, [state.open ? '×' : avatar])

    var panel = el('div', {
      className: 'nyven-panel' + (state.open ? '' : ' hidden'),
      role: 'dialog',
      'aria-label': name + ' chat',
    })

    var header = el('div', { className: 'nyven-header' }, [
      el('div', {
        className: 'nyven-avatar',
        style: { background: color + '22', color: color },
      }, [avatar]),
      el('div', null, [
        el('div', { className: 'nyven-title' }, [name]),
        el('div', { className: 'nyven-sub' }, [
          el('span', {
            className: 'nyven-dot' + (state.paused || !state.agent ? ' off' : ''),
          }),
          state.paused ? 'Paused' : state.agent ? 'Online' : 'Connecting…',
        ]),
      ]),
      el(
        'button',
        {
          className: 'nyven-close',
          type: 'button',
          'aria-label': 'Close',
          onClick: function () {
            state.open = false
            render()
          },
        },
        ['×']
      ),
    ])

    var msgs = el('div', { className: 'nyven-msgs', id: 'nyven-agent-msgs' })
    if (state.error && !state.agent) {
      msgs.appendChild(el('div', { className: 'nyven-msg error' }, [state.error]))
    } else {
      state.messages.forEach(function (m) {
        var kids = [m.content]
        if (m.knowledgeUsed) {
          kids.push(
            el('div', { style: { marginTop: '6px', fontSize: '10px', color: '#62E6FF', opacity: 0.85 } }, [
              'Answered from agent knowledge',
            ])
          )
        }
        msgs.appendChild(
          el(
            'div',
            {
              className:
                'nyven-msg ' +
                (m.role === 'user' ? 'user' : m.role === 'error' ? 'error' : 'agent') +
                (m.thinking ? ' thinking' : ''),
            },
            kids
          )
        )
      })
    }

    var input = el('textarea', {
      className: 'nyven-input',
      rows: '1',
      placeholder: state.paused ? 'Agent is paused' : 'Type a message…',
      disabled: state.loading || state.paused || !state.agent ? 'disabled' : null,
    })
    input.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault()
        sendMessage(input)
      }
    })

    var sendBtn = el(
      'button',
      {
        className: 'nyven-send',
        type: 'button',
        style: { background: color },
        disabled: state.loading || state.paused || !state.agent ? 'disabled' : null,
        onClick: function () {
          sendMessage(input)
        },
      },
      ['↑']
    )

    var footer = el('div', { className: 'nyven-footer' }, [input, sendBtn])
    var brand = el('div', { className: 'nyven-brand' }, [
      'Powered by ',
      el('a', { href: 'https://nyven.app', target: '_blank', rel: 'noopener' }, ['NYVEN']),
    ])

    panel.appendChild(header)
    panel.appendChild(msgs)
    panel.appendChild(footer)
    panel.appendChild(brand)
    root.appendChild(panel)
    root.appendChild(bubble)
  }

  function scrollMsgs() {
    setTimeout(function () {
      var box = document.getElementById('nyven-agent-msgs')
      if (box) box.scrollTop = box.scrollHeight
    }, 30)
  }

  function sendMessage(inputEl) {
    var text = (inputEl && inputEl.value ? inputEl.value : '').trim()
    if (!text || state.loading || !state.agent || state.paused) return

    state.messages.push({ role: 'user', content: text })
    state.messages.push({ role: 'agent', content: 'Thinking…', thinking: true })
    state.loading = true
    if (inputEl) inputEl.value = ''
    render()
    scrollMsgs()

    var history = state.messages
      .filter(function (m) {
        return !m.thinking && m.role !== 'error'
      })
      .slice(0, -1)
      .map(function (m) {
        return {
          role: m.role === 'user' ? 'user' : 'assistant',
          content: m.content,
        }
      })

    api('/api/agent/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        agentId: agentId,
        message: text,
        history: history,
        sessionId: sessionId,
      }),
    })
      .then(function (res) {
        state.messages = state.messages.filter(function (m) {
          return !m.thinking
        })
        if (res.ok && res.data && res.data.success && res.data.message) {
          state.messages.push({
            role: 'agent',
            content: res.data.message,
            knowledgeUsed: !!res.data.knowledgeUsed,
          })
        } else {
          state.messages.push({
            role: 'error',
            content: (res.data && res.data.error) || 'Something went wrong. Please try again.',
          })
        }
      })
      .catch(function () {
        state.messages = state.messages.filter(function (m) {
          return !m.thinking
        })
        state.messages.push({
          role: 'error',
          content: 'Network error. Please check your connection and try again.',
        })
      })
      .then(function () {
        state.loading = false
        render()
        scrollMsgs()
      })
  }

  function boot() {
    injectStyles()
    var root = document.createElement('div')
    root.id = 'nyven-agent-root'
    document.body.appendChild(root)
    render()

    api('/api/agent/public?id=' + encodeURIComponent(agentId), { method: 'GET' })
      .then(function (res) {
        if (res.ok && res.data && res.data.success && res.data.agent) {
          state.agent = res.data.agent
          state.paused = !!res.data.paused || res.data.agent.status === 'paused'
          if (!state.paused && state.agent.welcomeMessage) {
            state.messages = [
              { role: 'agent', content: state.agent.welcomeMessage },
            ]
          } else if (state.paused) {
            state.messages = [
              {
                role: 'error',
                content: 'This agent is currently paused and is not accepting messages.',
              },
            ]
          }
        } else {
          state.error =
            (res.data && res.data.error) ||
            'Agent is not available. It may not be published yet.'
        }
        render()
      })
      .catch(function () {
        state.error = 'Could not load this agent. Please try again later.'
        render()
      })
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot)
  } else {
    boot()
  }
})()
