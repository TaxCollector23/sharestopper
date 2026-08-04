import { motion, AnimatePresence } from 'framer-motion'
import { X, Shield, Keyboard, Download, Bell, Monitor } from 'lucide-react'
import { OverlayStyle, ProtectionProfile } from '@shared/types'

interface Props {
  isOpen: boolean
  onClose: () => void
  overlayStyle: OverlayStyle
  profile: ProtectionProfile
  onStyleChange: (style: OverlayStyle) => void
  onProfileChange: (profile: ProtectionProfile) => void
}

export function SettingsPanel({ isOpen, onClose, overlayStyle, profile, onStyleChange, onProfileChange }: Props) {
  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 bg-black/50 z-40"
            onClick={onClose}
          />
          <motion.div
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', damping: 30, stiffness: 300 }}
            className="absolute right-0 top-0 bottom-0 w-[340px] bg-surface-1 border-l border-zinc-800 z-50 flex flex-col"
          >
            <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800/50">
              <span className="text-sm font-medium text-zinc-200">Settings</span>
              <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-zinc-800 text-zinc-500 hover:text-zinc-300 transition-colors">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto">
              <Section icon={Shield} title="Protection Profile">
                {(['developer', 'business', 'student', 'streamer', 'custom'] as ProtectionProfile[]).map((p) => (
                  <label key={p} className="flex items-center gap-3 px-1 py-2 cursor-pointer group">
                    <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center transition-colors ${
                      profile === p ? 'border-accent bg-accent' : 'border-zinc-600 group-hover:border-zinc-500'
                    }`}>
                      {profile === p && <div className="w-1.5 h-1.5 rounded-full bg-white" />}
                    </div>
                    <span className="text-sm text-zinc-300 capitalize">{p}</span>
                  </label>
                ))}
              </Section>

              <Section icon={Monitor} title="Overlay Style">
                {(['block', 'blur', 'pixelate'] as OverlayStyle[]).map((s) => (
                  <label key={s} className="flex items-center gap-3 px-1 py-2 cursor-pointer group">
                    <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center transition-colors ${
                      overlayStyle === s ? 'border-accent bg-accent' : 'border-zinc-600 group-hover:border-zinc-500'
                    }`}>
                      {overlayStyle === s && <div className="w-1.5 h-1.5 rounded-full bg-white" />}
                    </div>
                    <span className="text-sm text-zinc-300 capitalize">{s === 'block' ? 'Black Block' : s === 'blur' ? 'Gaussian Blur' : 'Pixelation'}</span>
                  </label>
                ))}
              </Section>

              <Section icon={Keyboard} title="Keyboard Shortcuts">
                <Shortcut keys={['⌘', '⇧', 'P']} action="Toggle protection" />
                <Shortcut keys={['⌘', '⇧', 'H']} action="Hide all overlays" />
                <Shortcut keys={['⌘', ',']} action="Open settings" />
              </Section>

              <Section icon={Bell} title="Notifications">
                <Toggle label="Detection alerts" defaultChecked />
                <Toggle label="Sound effects" defaultChecked={false} />
                <Toggle label="Status bar icon" defaultChecked />
              </Section>

              <Section icon={Download} title="Data">
                <button className="w-full text-left text-sm text-zinc-400 hover:text-zinc-200 py-2 transition-colors">
                  Export detection history
                </button>
                <button className="w-full text-left text-sm text-zinc-400 hover:text-zinc-200 py-2 transition-colors">
                  Clear all detections
                </button>
              </Section>
            </div>

            <div className="px-4 py-3 border-t border-zinc-800/50 text-[11px] text-zinc-600">
              ShareStopper v1.0.0
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}

function Section({ icon: Icon, title, children }: { icon: any; title: string; children: React.ReactNode }) {
  return (
    <div className="px-4 py-4 border-b border-zinc-800/30">
      <div className="flex items-center gap-2 mb-3">
        <Icon className="w-3.5 h-3.5 text-zinc-500" />
        <span className="text-xs text-zinc-500 uppercase tracking-wider font-medium">{title}</span>
      </div>
      {children}
    </div>
  )
}

function Shortcut({ keys, action }: { keys: string[]; action: string }) {
  return (
    <div className="flex items-center justify-between py-1.5">
      <span className="text-sm text-zinc-400">{action}</span>
      <div className="flex gap-1">
        {keys.map((k, i) => (
          <kbd key={i} className="px-1.5 py-0.5 text-[11px] bg-zinc-800 text-zinc-400 rounded border border-zinc-700 font-mono">
            {k}
          </kbd>
        ))}
      </div>
    </div>
  )
}

function Toggle({ label, defaultChecked }: { label: string; defaultChecked: boolean }) {
  return (
    <label className="flex items-center justify-between py-1.5 cursor-pointer">
      <span className="text-sm text-zinc-400">{label}</span>
      <input type="checkbox" defaultChecked={defaultChecked} className="sr-only peer" />
      <div className="w-8 h-[18px] bg-zinc-700 rounded-full peer-checked:bg-accent transition-colors relative after:content-[''] after:absolute after:top-[3px] after:left-[3px] after:w-3 after:h-3 after:bg-white after:rounded-full after:transition-transform peer-checked:after:translate-x-[14px]" />
    </label>
  )
}
