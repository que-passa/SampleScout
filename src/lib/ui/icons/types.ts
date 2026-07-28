export const ICON_NAMES = [
	'back',
	'account',
	'collection',
	'trash',
	'minus',
	'reset',
	'field-notes',
	'import',
	'cleanup',
	'next',
	'loop',
	'zoom-in',
	'zoom-out',
	'close',
	'check',
	'play',
	'pause',
	'stop',
	'record',
	'settings'
] as const;

export type IconName = (typeof ICON_NAMES)[number];
