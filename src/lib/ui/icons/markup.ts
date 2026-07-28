import type { IconName } from './types';

import account from '$lib/assets/ui-icons/account.svg?raw';
import back from '$lib/assets/ui-icons/back.svg?raw';
import check from '$lib/assets/ui-icons/check.svg?raw';
import cleanup from '$lib/assets/ui-icons/cleanup.svg?raw';
import close from '$lib/assets/ui-icons/close.svg?raw';
import collection from '$lib/assets/ui-icons/collection.svg?raw';
import fieldNotes from '$lib/assets/ui-icons/field-notes.svg?raw';
import importIcon from '$lib/assets/ui-icons/import.svg?raw';
import loop from '$lib/assets/ui-icons/loop.svg?raw';
import minus from '$lib/assets/ui-icons/minus.svg?raw';
import next from '$lib/assets/ui-icons/next.svg?raw';
import pause from '$lib/assets/ui-icons/pause.svg?raw';
import play from '$lib/assets/ui-icons/play.svg?raw';
import record from '$lib/assets/ui-icons/record.svg?raw';
import reset from '$lib/assets/ui-icons/reset.svg?raw';
import settings from '$lib/assets/ui-icons/settings.svg?raw';
import stop from '$lib/assets/ui-icons/stop.svg?raw';
import trash from '$lib/assets/ui-icons/trash.svg?raw';
import zoomIn from '$lib/assets/ui-icons/zoom-in.svg?raw';
import zoomOut from '$lib/assets/ui-icons/zoom-out.svg?raw';

export const ICON_MARKUP: Record<IconName, string> = {
	account,
	back,
	check,
	cleanup,
	close,
	collection,
	'field-notes': fieldNotes,
	import: importIcon,
	loop,
	minus,
	next,
	pause,
	play,
	record,
	reset,
	settings,
	stop,
	trash,
	'zoom-in': zoomIn,
	'zoom-out': zoomOut
};
