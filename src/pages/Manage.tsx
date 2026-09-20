import { useState, type FormEvent } from 'react'
import { Navigate } from 'react-router-dom'
import { Markdown } from '../components/Markdown'
import { ErrorNote, Loading, PageHead } from '../components/bits'
import { useAuth } from '../lib/auth'
import { useLoad } from '../lib/data'
import { formatDate, slugify } from '../lib/format'
import { getSettings, listDecisions, listDocs, listQuestions, listUpdates } from '../lib/queries'
import { done, supabase } from '../lib/supabase'

type Row = { id: string } & Record<string, unknown>
type Values = Record<string, string | boolean>

interface Field {
  name: string
  label: string
  type: 'text' | 'textarea' | 'markdown' | 'date' | 'select' | 'checkbox' | 'number' | 'url'
  options?: Array<[string, string]>
  help?: string
  full?: boolean
  required?: boolean
}

interface Config {
  table: string
  noun: string
  fields: Field[]
  load: () => Promise<Row[]>
  blank: (rows: Row[]) => Values
  title: (row: Row) => string
  meta: (row: Row) => string
  prepare?: (payload: Record<string, unknown>) => Record<string, unknown>
  warnDelete?: string
}

// The list functions return typed rows; the form code only needs them as plain records.
const asRows = (load: () => Promise<unknown>) => load as () => Promise<Row[]>

const today = () => new Date().toISOString().slice(0, 10)

function toValues(fields: Field[], row: Row): Values {
  const values: Values = {}
  for (const f of fields) {
    const v = row[f.name]
    values[f.name] = f.type === 'checkbox' ? Boolean(v) : v == null ? '' : String(v)
  }
  return values
}

function toPayload(fields: Field[], values: Values): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const f of fields) {
    const v = values[f.name]
    if (f.type === 'checkbox') out[f.name] = Boolean(v)
    else if (f.type === 'number') out[f.name] = v === '' ? 0 : Number(v)
    else if (f.type === 'markdown') out[f.name] = String(v)
    else {
      const text = String(v).trim()
      out[f.name] = text === '' && !f.required ? null : text
    }
  }
  return out
}

function FieldInput({ field, value, onChange }: { field: Field; value: string | boolean; onChange: (v: string | boolean) => void }) {
  const [preview, setPreview] = useState(false)
  const id = `f-${field.name}`

  if (field.type === 'checkbox') {
    return (
      <label className="check">
        <input type="checkbox" checked={Boolean(value)} onChange={(e) => onChange(e.target.checked)} />
        {field.label}
      </label>
    )
  }

  let input
  if (field.type === 'textarea') {
    input = <textarea id={id} value={String(value)} required={field.required} onChange={(e) => onChange(e.target.value)} />
  } else if (field.type === 'markdown') {
    input = preview ? (
      <div className="preview-box">
        <Markdown source={String(value)} />
      </div>
    ) : (
      <textarea id={id} className="tall" value={String(value)} onChange={(e) => onChange(e.target.value)} />
    )
  } else if (field.type === 'select') {
    input = (
      <select id={id} value={String(value)} onChange={(e) => onChange(e.target.value)}>
        {field.options?.map(([v, text]) => (
          <option key={v} value={v}>
            {text}
          </option>
        ))}
      </select>
    )
  } else {
    input = <input id={id} type={field.type} value={String(value)} required={field.required} onChange={(e) => onChange(e.target.value)} />
  }

  return (
    <div className={`field${field.full || field.type === 'markdown' || field.type === 'textarea' ? ' full' : ''}`}>
      <label htmlFor={id}>
        <span>
          {field.label}
          {field.type === 'markdown' && (
            <>
              {' '}
              <button type="button" className="link-btn" onClick={() => setPreview((p) => !p)}>
                {preview ? 'Edit' : 'Preview'}
              </button>
            </>
          )}
        </span>
      </label>
      {input}
      {field.help && <small>{field.help}</small>}
    </div>
  )
}

function CrudTab({ config }: { config: Config }) {
  const { table, noun, fields } = config
  const list = useLoad(config.load, [table])
  const [editing, setEditing] = useState<{ id: string | null; values: Values } | null>(null)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null)

  const rows = list.data ?? []

  async function save(event: FormEvent) {
    event.preventDefault()
    if (!editing) return
    setBusy(true)
    setMessage(null)
    try {
      let payload = toPayload(fields, editing.values)
      if (config.prepare) payload = config.prepare(payload)
      if (editing.id) await done(supabase.from(table).update(payload).eq('id', editing.id))
      else await done(supabase.from(table).insert(payload))
      setEditing(null)
      setMessage({ ok: true, text: `Saved. The ${noun} is updated.` })
      list.reload()
    } catch (e) {
      setMessage({ ok: false, text: e instanceof Error ? e.message : 'That did not save.' })
    }
    setBusy(false)
  }

  async function remove(row: Row) {
    if (!window.confirm(`Delete “${config.title(row)}”? ${config.warnDelete ?? 'This cannot be undone.'}`)) return
    try {
      await done(supabase.from(table).delete().eq('id', row.id))
      setMessage({ ok: true, text: `Deleted the ${noun}.` })
      list.reload()
    } catch (e) {
      setMessage({ ok: false, text: e instanceof Error ? e.message : 'That did not delete.' })
    }
  }

  if (editing) {
    const set = (name: string, v: string | boolean) => setEditing({ ...editing, values: { ...editing.values, [name]: v } })
    return (
      <form onSubmit={save}>
        <h2 style={{ fontSize: '1.25rem', marginTop: 0 }}>{editing.id ? `Edit ${noun}` : `New ${noun}`}</h2>
        <div className="form-grid">
          {fields.map((f) => (
            <FieldInput key={f.name} field={f} value={editing.values[f.name]} onChange={(v) => set(f.name, v)} />
          ))}
        </div>
        {message && !message.ok && <p className="notice error" role="alert">{message.text}</p>}
        <div className="btn-row">
          <button type="submit" className="btn" disabled={busy}>
            {busy ? 'Saving…' : 'Save'}
          </button>
          <button type="button" className="btn quiet" onClick={() => { setEditing(null); setMessage(null) }}>
            Cancel
          </button>
        </div>
      </form>
    )
  }

  return (
    <>
      <div className="btn-row" style={{ justifyContent: 'space-between', marginBottom: '1rem' }}>
        <span className="muted sans small">{rows.length} in total</span>
        <button type="button" className="btn small" onClick={() => { setMessage(null); setEditing({ id: null, values: config.blank(rows) }) }}>
          New {noun}
        </button>
      </div>
      {message && <p className={`notice ${message.ok ? 'ok' : 'error'}`} role={message.ok ? 'status' : 'alert'}>{message.text}</p>}
      <ErrorNote error={list.error} />
      {list.loading && !list.data ? (
        <Loading />
      ) : (
        <div>
          {rows.map((row) => (
            <div className="manage-row" key={row.id}>
              <div>
                <b>{config.title(row)}</b>
                <div className="meta">{config.meta(row)}</div>
              </div>
              <div className="manage-actions">
                <button type="button" className="btn quiet small" onClick={() => { setMessage(null); setEditing({ id: row.id, values: toValues(fields, row) }) }} aria-label={`Edit ${config.title(row)}`}>
                  Edit
                </button>
                <button type="button" className="btn danger small" onClick={() => void remove(row)} aria-label={`Delete ${config.title(row)}`}>
                  Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  )
}

// ---- what each list looks like ----

const statusPublished: Array<[string, string]> = [['published', 'Published (visible to everyone with access)'], ['draft', 'Draft (only I can see it)']]

const updatesConfig: Config = {
  table: 'updates',
  noun: 'update',
  load: asRows(listUpdates),
  blank: () => ({ title: '', summary: '', details_md: '', released_on: today(), version: '', demo_url: '', status: 'published' }),
  title: (r) => String(r.title),
  meta: (r) => `${formatDate(String(r.released_on))}${r.version ? ` · ${r.version}` : ''}${r.status === 'draft' ? ' · Draft' : ''}`,
  fields: [
    { name: 'title', label: 'Title', type: 'text', required: true, full: true },
    { name: 'released_on', label: 'Date finished', type: 'date', required: true },
    { name: 'version', label: 'Version', type: 'text', help: 'For example v0.3. Optional.' },
    { name: 'summary', label: 'Summary', type: 'textarea', required: true, help: 'One or two plain sentences on what is now possible.' },
    { name: 'details_md', label: 'Details', type: 'markdown', help: 'Optional. Shown under “What changed”. Markdown is fine.' },
    { name: 'demo_url', label: 'Link to try this exact version', type: 'url', help: 'Usually leave empty. The main prototype link always opens the newest version.' },
    { name: 'status', label: 'Status', type: 'select', options: statusPublished },
  ],
}

const documentsConfig: Config = {
  table: 'documents',
  noun: 'document',
  load: asRows(() => listDocs()),
  blank: () => ({ kind: 'weekly', slug: '', title: '', summary: '', body_md: '', pinned: false, period_start: '', period_end: '', status: 'draft' }),
  title: (r) => String(r.title),
  meta: (r) => `${r.kind}${r.pinned ? ' · pinned to the top' : ''} · ${r.status}`,
  prepare: (p) => ({ ...p, slug: p.slug || slugify(String(p.title)) }),
  warnDelete: 'Every comment on this document is deleted with it, and this cannot be undone.',
  fields: [
    { name: 'title', label: 'Title', type: 'text', required: true, full: true },
    { name: 'kind', label: 'Type', type: 'select', options: [['weekly', 'Weekly report'], ['blueprint', 'Blueprint'], ['page', 'Other page']] },
    { name: 'slug', label: 'Web address name', type: 'text', help: 'Leave empty to make it from the title. Weekly reports open at /reports/<this>.' },
    { name: 'period_start', label: 'Week starts', type: 'date', help: 'Weekly reports only.' },
    { name: 'period_end', label: 'Week ends', type: 'date' },
    { name: 'summary', label: 'Short summary', type: 'textarea', help: 'Shown in lists and on the overview.' },
    { name: 'body_md', label: 'Text', type: 'markdown', help: 'Markdown. Use ## for section headings. Diagrams use a ```mermaid block.' },
    { name: 'status', label: 'Status', type: 'select', options: statusPublished },
    { name: 'pinned', label: 'Pin to the top of the overview (the Blueprint)', type: 'checkbox' },
  ],
}

const decisionsConfig: Config = {
  table: 'decisions',
  noun: 'decision',
  load: asRows(listDecisions),
  blank: (rows) => ({ title: '', detail: '', status: 'open', outcome: '', decided_on: '', needed_by: '', position: String(rows.length + 1) }),
  title: (r) => String(r.title),
  meta: (r) => `${r.status}${r.decided_on ? ` · ${formatDate(String(r.decided_on))}` : ''}`,
  fields: [
    { name: 'title', label: 'Decision', type: 'text', required: true, full: true },
    { name: 'status', label: 'Status', type: 'select', options: [['open', 'Open'], ['decided', 'Decided'], ['parked', 'Parked']] },
    { name: 'position', label: 'Order', type: 'number' },
    { name: 'outcome', label: 'What was decided', type: 'textarea' },
    { name: 'detail', label: 'Detail', type: 'textarea' },
    { name: 'decided_on', label: 'Decided on', type: 'date' },
    { name: 'needed_by', label: 'Needed by', type: 'date' },
  ],
}

function QuestionsTab() {
  const docs = useLoad(listDocs)
  if (!docs.data) return docs.error ? <ErrorNote error={docs.error} /> : <Loading />
  const config: Config = {
    table: 'questions',
    noun: 'question',
    load: asRows(listQuestions),
    blank: (rows) => ({
      document_id: docs.data?.find((d) => d.kind === 'blueprint')?.id ?? '',
      key: `q${rows.length + 1}`,
      prompt: '',
      why: '',
      note: '',
      position: String(rows.length + 1),
      status: 'open',
    }),
    title: (r) => String(r.prompt),
    meta: (r) => `${r.key} · ${r.status}`,
    warnDelete: 'Every answer to it is deleted too, and this cannot be undone. To keep the answers, close the question instead.',
    fields: [
      { name: 'prompt', label: 'Question', type: 'textarea', required: true },
      { name: 'why', label: 'Why I am asking', type: 'text', full: true, help: 'One short line under the question.' },
      { name: 'document_id', label: 'Belongs to', type: 'select', options: [['', 'No document'], ...docs.data.map((d): [string, string] => [d.id, d.title])] },
      { name: 'key', label: 'Short name', type: 'text', required: true, help: 'Must be unique, for example q8.' },
      { name: 'status', label: 'Status', type: 'select', options: [['open', 'Open (answers can be given)'], ['closed', 'Closed (answers locked)']] },
      { name: 'position', label: 'Order', type: 'number' },
      { name: 'note', label: 'Answer note', type: 'textarea', help: 'Optional. Use it to record an answer that came outside the portal, such as by email.' },
    ],
  }
  return <CrudTab config={config} />
}

// ---- the live prototype's details ----

const settingFields: Array<[string, string, 'url' | 'text' | 'date', string?]> = [
  ['prototype_url', 'Prototype address', 'url', 'The link Ms Kay opens. Keep it the same and she always gets the newest version.'],
  ['prototype_version', 'Version', 'text', 'For example v0.3.'],
  ['prototype_updated', 'Last updated', 'date'],
  ['prototype_note', 'What is new', 'text', 'One short line.'],
]

function PrototypeTab() {
  const loaded = useLoad(getSettings)
  const [values, setValues] = useState<Record<string, string> | null>(null)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null)

  if (!loaded.data) return loaded.error ? <ErrorNote error={loaded.error} /> : <Loading />
  const current = values ?? loaded.data

  async function save(event: FormEvent) {
    event.preventDefault()
    setBusy(true)
    setMessage(null)
    try {
      const rows = settingFields.map(([key]) => ({ key, value: (current[key] ?? '').trim() }))
      await done(supabase.from('settings').upsert(rows, { onConflict: 'key' }))
      setMessage({ ok: true, text: 'Saved. Ms Kay sees this on the Progress page.' })
    } catch (e) {
      setMessage({ ok: false, text: e instanceof Error ? e.message : 'That did not save.' })
    }
    setBusy(false)
  }

  return (
    <form onSubmit={save} style={{ maxWidth: '36rem' }}>
      <p className="muted sans small" style={{ marginTop: 0 }}>
        These details appear on the Overview and Progress pages. Change them whenever the prototype is updated.
      </p>
      {settingFields.map(([key, label, type, help]) => (
        <label className="field" key={key}>
          <span>{label}</span>
          <input type={type} value={current[key] ?? ''} onChange={(e) => setValues({ ...current, [key]: e.target.value })} />
          {help && <small>{help}</small>}
          {key === 'prototype_updated' && (
            <button type="button" className="link-btn" onClick={() => setValues({ ...current, [key]: today() })}>
              Set to today
            </button>
          )}
        </label>
      ))}
      {message && <p className={`notice ${message.ok ? 'ok' : 'error'}`} role={message.ok ? 'status' : 'alert'}>{message.text}</p>}
      <button type="submit" className="btn" disabled={busy}>
        {busy ? 'Saving…' : 'Save'}
      </button>
    </form>
  )
}

const tabs = ['Prototype', 'Updates', 'Documents', 'Questions', 'Decisions'] as const
type Tab = (typeof tabs)[number]

export function Manage() {
  const { isOwner } = useAuth()
  const [tab, setTab] = useState<Tab>('Updates')
  if (!isOwner) return <Navigate to="/" replace />

  return (
    <>
      <PageHead eyebrow="Owner only" title="Manage" byline="Add an update, edit a report, or change the prototype details. Ms Kay cannot see this page." />
      <div className="tabs" role="tablist">
        {tabs.map((t) => (
          <button key={t} type="button" role="tab" aria-selected={tab === t} onClick={() => setTab(t)}>
            {t}
          </button>
        ))}
      </div>
      {tab === 'Prototype' && <PrototypeTab />}
      {tab === 'Updates' && <CrudTab key="u" config={updatesConfig} />}
      {tab === 'Documents' && <CrudTab key="d" config={documentsConfig} />}
      {tab === 'Questions' && <QuestionsTab />}
      {tab === 'Decisions' && <CrudTab key="c" config={decisionsConfig} />}
    </>
  )
}
