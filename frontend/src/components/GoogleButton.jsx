import React, { useEffect, useRef, useState } from 'react'

// The OAuth Client ID is public by design (Google shows it in every sign-in popup)
const CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID
  || '53564908495-mlk1m58b96tifkmjuprr9rjaijm9n28l.apps.googleusercontent.com'

let scriptPromise = null
function loadGoogleScript() {
  if (window.google?.accounts?.id) return Promise.resolve()
  if (!scriptPromise) {
    scriptPromise = new Promise((resolve, reject) => {
      const s = document.createElement('script')
      s.src = 'https://accounts.google.com/gsi/client'
      s.async = true
      s.onload = resolve
      s.onerror = () => { scriptPromise = null; reject(new Error('Google sign-in could not load')) }
      document.head.appendChild(s)
    })
  }
  return scriptPromise
}

/* Google's official "Continue with Google" button. Google gives us a signed
   token (credential), and the server checks it before signing anyone in. */
export default function GoogleButton({ onCredential, text = 'continue_with' }) {
  const box = useRef(null)
  const callback = useRef(onCredential)
  callback.current = onCredential
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    let cancelled = false
    loadGoogleScript()
      .then(() => {
        if (cancelled || !box.current) return
        window.google.accounts.id.initialize({
          client_id: CLIENT_ID,
          callback: (res) => callback.current(res.credential),
        })
        window.google.accounts.id.renderButton(box.current, {
          theme: 'outline', size: 'large', shape: 'rectangular', text,
          logo_alignment: 'center',
          locale: 'en', // otherwise Google uses the browser's language (e.g. Korean)
          width: Math.min(box.current.offsetWidth || 336, 400), // match the form's width
        })
      })
      .catch(() => !cancelled && setFailed(true))
    return () => { cancelled = true }
  }, [text])

  if (failed) {
    return <p className="text-xs text-gray-400 text-center">Google sign-in isn't available right now.</p>
  }
  return <div ref={box} className="w-full flex justify-center min-h-[44px]" />
}
