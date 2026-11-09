import { useEffect, useState } from 'react'
import Header from './components/Header.jsx'
import Home from './components/Home.jsx'
import HostRoom from './components/HostRoom.jsx'
import ViewerRoom from './components/ViewerRoom.jsx'
import { useHost } from './hooks/useHost.js'
import { useViewer } from './hooks/useViewer.js'
import { useInteractions } from './hooks/useInteractions.js'
import { primeAudio } from './lib/sound.js'
import { claimRoom, releaseRoom } from './lib/presence.js'
import { codeFromUrl, getPlace, loadName, saveName } from './lib/room.js'

export default function App() {
  useInteractions()
  useEffect(() => {
    getPlace()
  }, [])
  const host = useHost()
  const viewer = useViewer()
  const [name, setName] = useState('')
  const [initialCode] = useState(codeFromUrl)
  const [initialName] = useState(loadName)
  const [roomConflict, setRoomConflict] = useState('')
  const idle = host.status === 'idle' && viewer.status === 'idle'

  // The slot is held from the first click until both sides are back at the start screen.
  useEffect(() => {
    if (idle) releaseRoom()
  }, [idle])

  async function enter() {
    setRoomConflict('')
    if (await claimRoom()) return true
    setRoomConflict('Você já está em uma sala em outra aba deste navegador. Saia dela antes de entrar ou criar outra.')
    return false
  }

  async function join(code, viewerName) {
    primeAudio()
    if (!(await enter())) return
    saveName(viewerName)
    setName(viewerName)
    viewer.join(code, viewerName)
  }

  async function start(password, hostName, options) {
    primeAudio()
    if (!(await enter())) return
    saveName(hostName)
    host.start(password, hostName, options)
  }

  function goHome() {
    host.stop()
    viewer.leave()
  }

  let screen
  if (host.status === 'live') {
    screen = (
      <HostRoom
        code={host.code}
        locked={host.locked}
        name={host.name}
        place={host.place}
        placeError={host.placeError}
        quality={host.quality}
        onSetQuality={host.setQuality}
        participants={host.participants}
        stream={host.stream}
        source={host.source}
        error={host.error}
        audioFailed={host.audioFailed}
        onStop={host.stop}
        onStopSharing={host.stopSharing}
        onStopGuest={host.stopGuest}
        onShareAgain={host.shareAgain}
        onSetSharer={host.setSharer}
        onKick={host.kick}
        onSetModerator={host.setModerator}
        onChangeCode={host.changeCode}
        messages={host.messages}
        onSendChat={host.sendChat}
      />
    )
  } else if (viewer.status !== 'idle') {
    screen = (
      <ViewerRoom
        code={viewer.code}
        status={viewer.status}
        stream={viewer.stream}
        error={viewer.error}
        roster={viewer.roster}
        meId={viewer.meId}
        sharing={viewer.sharing}
        presenting={viewer.presenting}
        shareError={viewer.shareError}
        onStartShare={viewer.startShare}
        onStopShare={viewer.stopShare}
        onRetry={() => viewer.join(viewer.code, name)}
        onPassword={(password) => viewer.join(viewer.code, name, password)}
        onLeave={viewer.leave}
        onKick={viewer.kick}
        onSetAdmin={viewer.setAdmin}
        onSetSharer={viewer.setSharer}
        onStopGuest={viewer.stopGuest}
        onChangeCode={viewer.changeCode}
        messages={viewer.messages}
        onSendChat={viewer.sendChat}
      />
    )
  } else {
    screen = (
      <Home
        initialCode={initialCode}
        initialName={initialName}
        starting={host.status === 'starting'}
        error={host.error || roomConflict}
        audioFailed={host.audioFailed}
        onStart={start}
        onJoin={join}
      />
    )
  }

  return (
    <>
      <Header onHome={goHome} />
      {screen}
    </>
  )
}
