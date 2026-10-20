// Minimal DeskThing server stub. The game runs entirely on the device and saves locally.
import { DeskThing } from '@deskthing/server'
import { DESKTHING_EVENTS } from '@deskthing/types'

DeskThing.on(DESKTHING_EVENTS.START, async () => { console.log('Westward 1848 started') })
DeskThing.on(DESKTHING_EVENTS.STOP, async () => { console.log('Westward 1848 stopped') })
