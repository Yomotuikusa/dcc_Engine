import { useRef, useState } from 'react'
import { Group, Panel, Separator } from 'react-resizable-panels'
import type { PrimitiveKind } from '@/engine/primitives'
import { Menubar } from '@/ui/layout/Menubar'
import { StatusBar } from '@/ui/layout/StatusBar'
import { useGlobalUndoRedo } from '@/ui/hooks/useGlobalUndoRedo'
import { OutlinerPanel } from '@/ui/panels/OutlinerPanel'
import { PropertiesPanel } from '@/ui/panels/PropertiesPanel'
import { ViewportPanel } from '@/ui/panels/ViewportPanel'

function ResizeHandle(): React.JSX.Element {
  return <Separator className="w-1 bg-neutral-800 transition-colors hover:bg-neutral-700" />
}

export function DockLayout(): React.JSX.Element {
  useGlobalUndoRedo()
  const [pendingFile, setPendingFile] = useState<File | null>(null)
  const [pendingPrimitive, setPendingPrimitive] = useState<{ kind: PrimitiveKind; nonce: number } | null>(
    null
  )
  const primitiveNonceRef = useRef(0)
  const fileInputRef = useRef<HTMLInputElement | null>(null)

  const handleImportFbx = (): void => {
    fileInputRef.current?.click()
  }

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>): void => {
    const selectedFile = event.target.files?.[0] ?? null
    setPendingFile(selectedFile)
    event.target.value = ''
  }

  const handleAddPrimitive = (kind: PrimitiveKind): void => {
    const nextNonce = primitiveNonceRef.current + 1
    primitiveNonceRef.current = nextNonce
    setPendingPrimitive({ kind, nonce: nextNonce })
  }

  return (
    <div className="flex h-screen min-h-0 min-w-0 flex-col bg-neutral-950 text-neutral-100">
      <Menubar onImportFbx={handleImportFbx} onAddPrimitive={handleAddPrimitive} />
      <input
        ref={fileInputRef}
        type="file"
        accept=".fbx"
        className="hidden"
        data-testid="fbx-file-input"
        onChange={handleFileChange}
      />
      <div className="min-h-0 min-w-0 flex-1">
        <Group orientation="horizontal" className="h-full min-h-0 min-w-0">
          <Panel defaultSize={18} minSize={12}>
            <OutlinerPanel />
          </Panel>
          <ResizeHandle />
          <Panel defaultSize={64} minSize={30}>
            <ViewportPanel pendingFile={pendingFile} pendingPrimitive={pendingPrimitive} />
          </Panel>
          <ResizeHandle />
          <Panel defaultSize={18} minSize={12}>
            <PropertiesPanel />
          </Panel>
        </Group>
      </div>
      <StatusBar />
    </div>
  )
}
