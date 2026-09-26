import { X, Plus, ArrowUpDown, LocateFixed } from 'lucide-react'

// Start, stops and destination of the route being planned, over the map (like
// Google Maps' directions card). Tapping a row asks MapPage to choose that
// point (search, your location, or a tap on the map).
//   draft     { from, stops: [{ name }], to } — from/to may be null (not chosen
//             yet); `me: true` marks "Your location"
//   onEdit({ slot: 'from' | 'to' | 'stop', index })
function RouteEditor({ draft, maxStops, onEdit, onRemoveStop, onAddStop, onSwap, onClose, editorRef }) {
  const canAddStop = draft.stops.length < maxStops
  return (
    <div className="route-editor" ref={editorRef}>
      <div className="route-editor-rows">
        <EditorRow
          kind="from"
          point={draft.from}
          placeholder="Choose starting point"
          onClick={() => onEdit({ slot: 'from' })}
        />
        {draft.stops.map((stop, i) => (
          <EditorRow
            key={`${i}:${stop.lat},${stop.lng}`}
            kind="stop"
            label={i + 1}
            point={stop}
            onClick={() => onEdit({ slot: 'stop', index: i })}
            onRemove={() => onRemoveStop(i)}
          />
        ))}
        <EditorRow kind="to" point={draft.to} placeholder="Choose destination" onClick={() => onEdit({ slot: 'to' })} />
      </div>
      <div className="route-editor-side">
        <button className="route-editor-icon" onClick={onClose} aria-label="Close directions">
          <X size={16} />
        </button>
        <button
          className="route-editor-icon"
          onClick={onSwap}
          disabled={!draft.from && !draft.to}
          aria-label="Swap start and destination"
          title="Swap start and destination"
        >
          <ArrowUpDown size={16} />
        </button>
      </div>
      <button className="route-editor-add" onClick={onAddStop} disabled={!canAddStop}>
        <Plus size={14} /> {canAddStop ? 'Add stop' : `Up to ${maxStops} stops`}
      </button>
    </div>
  )
}

function EditorRow({ kind, label, point, placeholder, onClick, onRemove }) {
  return (
    <div className={`route-editor-row ${kind}`}>
      <span className={`route-editor-dot ${kind}`} aria-hidden="true">
        {kind === 'stop' ? label : null}
      </span>
      <button className={'route-editor-field' + (point ? '' : ' empty')} onClick={onClick}>
        {point?.me && <LocateFixed size={13} />}
        <span>{point ? point.name : placeholder}</span>
      </button>
      {onRemove && (
        <button className="route-editor-remove" onClick={onRemove} aria-label={`Remove stop ${label}`}>
          <X size={14} />
        </button>
      )}
    </div>
  )
}

export default RouteEditor
