// Photo de profil du propriétaire : sa photo d'origine, une photo importée, ou un œil animé de la couleur choisie.
// Un clic sur la photo du dashboard ouvre le choix (mêmes couleurs que les photos des clients).
import { useEffect, useRef, useState } from 'react'
import { owner } from '../config'
import { repo, type OwnerProfile } from '../data'
import { mediaHref } from '../lib/api'
import { AVATAR_COLORS } from '../lib/people'
import { squareImage } from './PeopleEditor'
import { Eye } from './Initials'
import { IconCheck } from './icons'
import { useToast } from './Toast'
import './share-panel.css'

// Profil chargé une seule fois et partagé par toute l'application.
let current: OwnerProfile | null = null
let loading: Promise<void> | null = null
const listeners = new Set<() => void>()
const publish = (p: OwnerProfile) => {
  current = p
  listeners.forEach((l) => l())
}

export function useOwnerProfile() {
  const [profile, setProfile] = useState(current)
  useEffect(() => {
    const update = () => setProfile(current)
    listeners.add(update)
    loading ??= repo.getProfile().then(publish).catch(() => publish({ name: owner.fullName, avatar: null }))
    update()
    return () => {
      listeners.delete(update)
    }
  }, [])
  return profile
}

/** Contenu de la pastille : photo ou œil. */
export function OwnerAvatarImage() {
  const profile = useOwnerProfile()
  const avatar = profile?.avatar ?? null
  if (avatar?.startsWith('eye:')) return <Eye color={avatar.slice(4)} />
  return <img src={avatar ? mediaHref(avatar) : owner.avatarUrl} alt="" />
}

/** Photo du dashboard (en haut à droite), cliquable pour la changer. */
export function OwnerAvatarButton() {
  const toast = useToast()
  const profile = useOwnerProfile()
  const [open, setOpen] = useState(false)
  const box = useRef<HTMLDivElement>(null)
  const avatar = profile?.avatar ?? null

  useEffect(() => {
    if (!open) return
    const close = (e: PointerEvent) => !box.current?.contains(e.target as Node) && setOpen(false)
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    window.addEventListener('pointerdown', close)
    window.addEventListener('keydown', esc)
    return () => {
      window.removeEventListener('pointerdown', close)
      window.removeEventListener('keydown', esc)
    }
  }, [open])

  const choose = async (value: string | null) => {
    try {
      publish(await repo.setProfile(value))
    } catch {
      toast('Impossible de changer la photo pour le moment')
    }
  }

  const importPhoto = async (file: File | undefined) => {
    if (!file) return
    try {
      const url = await repo.uploadAvatar('owner', await squareImage(file))
      await choose(url)
      setOpen(false)
      toast('Photo de profil changée')
    } catch {
      toast('Cette image n’a pas pu être importée')
    }
  }

  return (
    <div ref={box} className="owner">
      <button className="ds-avatar dash__avatar owner__button" onClick={() => setOpen((o) => !o)} aria-label="Changer ma photo de profil" title="Changer ma photo de profil">
        <OwnerAvatarImage />
      </button>
      {open && (
        <div className="pe__picker owner__picker" role="dialog" aria-label="Ma photo de profil">
          <div className="pe__picker-title">Ma photo de profil</div>
          <div className="pe__colors">
            {AVATAR_COLORS.map((c) => (
              <button key={c} className={`pe__color${avatar === `eye:${c}` ? ' is-on' : ''}`} onClick={() => choose(`eye:${c}`)} aria-label={`Œil ${c}`}>
                <Eye color={c} />
                {avatar === `eye:${c}` && <span className="pe__check"><IconCheck size={10} /></span>}
              </button>
            ))}
          </div>
          <label className="pe__upload">
            Importer une photo
            <input type="file" accept="image/*" onChange={(e) => importPhoto(e.target.files?.[0])} hidden />
          </label>
          {avatar && (
            <button className="pe__remove" onClick={() => choose(null)}>Reprendre ma photo d’origine</button>
          )}
        </div>
      )}
    </div>
  )
}
