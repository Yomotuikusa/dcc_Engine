import { useState } from 'react'
import { Group, Panel, Separator } from 'react-resizable-panels'
import { Menubar } from '@/ui/layout/Menubar'
import { StatusBar } from '@/ui/layout/StatusBar'
import { OutlinerPanel } from '@/ui/panels/OutlinerPanel'
import { PropertiesPanel } from '@/ui/panels/PropertiesPanel'
import { ViewportPanel } from '@/ui/panels/ViewportPanel'

function ResizeHandle(): React.JSX.Element {
  return <Separator className="w-1 bg-neutral-800 transition-colors hover:bg-neutral-700" />
}

export function DockLayout(): React.JSX.Element {
  const [importRequestId, setImportRequestId] = useState(0)

  return (
    <div className="flex h-screen min-h-0 min-w-0 flex-col bg-neutral-950 text-neutral-100">
      <Menubar onImportFbx={() => setImportRequestId((value) => value + 1)} />
      <div className="min-h-0 min-w-0 flex-1">
        <Group orientation="horizontal" className="h-full min-h-0 min-w-0">
          <Panel defaultSize={18} minSize={12}>
            <OutlinerPanel />
          </Panel>
          <ResizeHandle />
          <Panel defaultSize={64} minSize={30}>
            <ViewportPanel importRequestId={importRequestId} />
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
