import { Box, Eye, FolderOpen, Pencil } from 'lucide-react'
import {
  Menubar as ShadMenubar,
  MenubarContent,
  MenubarItem,
  MenubarMenu,
  MenubarTrigger
} from '@/components/ui/menubar'

interface MenubarProps {
  onImportFbx: () => void
}

export function Menubar({ onImportFbx }: MenubarProps): React.JSX.Element {
  return (
    <header className="shrink-0 min-w-0" data-testid="menu-panel" role="region" aria-label="メニューバー">
      <ShadMenubar>
        <MenubarMenu>
          <MenubarTrigger>File</MenubarTrigger>
          <MenubarContent>
            <MenubarItem data-testid="import-fbx-menu" onClick={onImportFbx}>
              <FolderOpen className="mr-2 h-4 w-4" />
              Import FBX
            </MenubarItem>
          </MenubarContent>
        </MenubarMenu>
        <MenubarMenu>
          <MenubarTrigger>Edit</MenubarTrigger>
          <MenubarContent>
            <MenubarItem>
              <Pencil className="mr-2 h-4 w-4" />
              Preferences
            </MenubarItem>
          </MenubarContent>
        </MenubarMenu>
        <MenubarMenu>
          <MenubarTrigger>View</MenubarTrigger>
          <MenubarContent>
            <MenubarItem>
              <Eye className="mr-2 h-4 w-4" />
              Reset Layout
            </MenubarItem>
          </MenubarContent>
        </MenubarMenu>
        <div className="ml-auto flex items-center text-xs text-neutral-400">
          <Box className="mr-1 h-4 w-4" />
          3D Engine
        </div>
      </ShadMenubar>
    </header>
  )
}
