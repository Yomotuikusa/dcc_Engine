import { Box, Eye, FolderOpen, Pencil } from 'lucide-react'
import type { PrimitiveKind } from '@/engine/primitives'
import {
  Menubar as ShadMenubar,
  MenubarContent,
  MenubarItem,
  MenubarMenu,
  MenubarSub,
  MenubarSubContent,
  MenubarSubTrigger,
  MenubarTrigger
} from '@/components/ui/menubar'

interface MenubarProps {
  onImportFbx: () => void
  onAddPrimitive: (kind: PrimitiveKind) => void
}

export function Menubar({ onImportFbx, onAddPrimitive }: MenubarProps): React.JSX.Element {
  return (
    <header className="shrink-0 min-w-0" data-testid="menu-panel" aria-label="メニューバー">
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
            <MenubarSub>
              <MenubarSubTrigger>Object</MenubarSubTrigger>
              <MenubarSubContent>
                <MenubarItem data-testid="add-primitive-cube" onClick={() => onAddPrimitive('cube')}>
                  Cube
                </MenubarItem>
                <MenubarItem data-testid="add-primitive-sphere" onClick={() => onAddPrimitive('sphere')}>
                  Sphere
                </MenubarItem>
                <MenubarItem
                  data-testid="add-primitive-cylinder"
                  onClick={() => onAddPrimitive('cylinder')}
                >
                  Cylinder
                </MenubarItem>
                <MenubarItem data-testid="add-primitive-cone" onClick={() => onAddPrimitive('cone')}>
                  Cone
                </MenubarItem>
              </MenubarSubContent>
            </MenubarSub>
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
