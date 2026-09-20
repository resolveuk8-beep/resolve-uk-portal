import { useState } from 'react'
import { Markdown } from '../components/Markdown'
import { ErrorNote, Loading, PageHead } from '../components/bits'
import { ExternalIcon } from '../components/Icons'
import { useLoad } from '../lib/data'
import { formatDate } from '../lib/format'
import { getSettings, listUpdates } from '../lib/queries'

export function Progress() {
  const [preview, setPreview] = useState(false)
  const loaded = useLoad(async () => {
    const [settings, updates] = await Promise.all([getSettings(), listUpdates()])
    return { settings, updates }
  })

  if (loaded.loading && !loaded.data) return <Loading />
  if (!loaded.data) return <ErrorNote error={loaded.error} />
  const { settings, updates } = loaded.data
  const url = settings.prototype_url

  return (
    <>
      <PageHead
        eyebrow="Resolve UK"
        title="Progress"
        byline="The working prototype, and a list of every major update as it is finished."
      />

      <div className="card">
        <div className="proto-head">
          <div>
            <h3 style={{ marginBottom: '0.2rem' }}>
              The live prototype {settings.prototype_version && <span className="pill">{settings.prototype_version}</span>}
            </h3>
            <p className="muted sans small" style={{ margin: 0 }}>
              {settings.prototype_updated ? `Last updated ${formatDate(settings.prototype_updated)}` : 'Always the latest version'}
            </p>
          </div>
          {url && (
            <a className="btn" href={url} target="_blank" rel="noreferrer">
              Open the prototype <ExternalIcon />
            </a>
          )}
        </div>
        {settings.prototype_note && <p style={{ marginTop: '0.9rem' }}>{settings.prototype_note}</p>}
        <p className="muted sans small">
          It is a working test. I keep it up to date, so the link always opens the newest version. On a phone, open it and choose “Add to Home Screen” to install it like an app.
        </p>
        {url && (
          <>
            <button type="button" className="btn quiet small" onClick={() => setPreview((v) => !v)} aria-expanded={preview}>
              {preview ? 'Hide the preview' : 'Preview it here'}
            </button>
            {preview && (
              <>
                <div className="phone">
                  <iframe title="Resolve UK prototype" src={url} allow="geolocation; camera" />
                </div>
                <p className="muted sans small" style={{ textAlign: 'center', marginTop: '0.6rem' }}>
                  If this stays blank, use “Open the prototype” above. Location and the camera work best there.
                </p>
              </>
            )}
          </>
        )}
      </div>

      <h2 style={{ fontSize: '1.25rem', marginTop: '2.5rem' }}>Updates</h2>
      <p className="muted sans small" style={{ marginTop: 0 }}>
        One entry each time a big piece of work is finished, newest first.
      </p>
      <ol className="timeline">
        {updates.map((u) => (
          <li key={u.id}>
            <div className="when">
              <span>{formatDate(u.released_on)}</span>
              {u.version && <span className="pill">{u.version}</span>}
              {u.status === 'draft' && <span className="pill warn">Draft</span>}
            </div>
            <h3>{u.title}</h3>
            <p style={{ marginBottom: 0 }}>{u.summary}</p>
            {u.details_md.trim() && (
              <details>
                <summary>What changed</summary>
                <Markdown source={u.details_md} />
              </details>
            )}
            {u.demo_url && (
              <p style={{ margin: '0.5rem 0 0' }}>
                <a href={u.demo_url} target="_blank" rel="noreferrer">
                  Try this version
                </a>
              </p>
            )}
          </li>
        ))}
      </ol>
      {updates.length === 0 && <p className="muted">No updates yet.</p>}
    </>
  )
}
