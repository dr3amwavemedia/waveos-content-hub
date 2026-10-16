import { FORMATS, type DesignDocument, type DesignFormat, type DesignElement } from './studio-document.ts';
import { ratioCrop } from './studio-geometry.ts';
export const STUDIO_TEMPLATES = [
  { name: 'Testimonial', category: 'Testimonials', photo: 'wellness', headline: '“An experience\nworth sharing.”', accent: 'Your words, our inspiration', font: 'Georgia', style: 'editorial' },
  { name: 'Our story', category: 'Brand Story', photo: 'studio', headline: 'Made with purpose.', accent: 'A little about us', font: 'Georgia', style: 'editorial' },
  { name: 'Behind the scenes', category: 'Behind the Scenes', photo: 'studio', headline: 'The work behind\nthe moment.', accent: 'Behind the scenes', font: 'Arial', style: 'modern' },
  { name: 'Our process', category: 'Process', photo: 'studio', headline: 'Care in every step.', accent: '01 / Ideas into reality', font: 'Arial', style: 'modern' },
  { name: 'Built on trust', category: 'Trades', photo: 'trades', headline: 'GOOD WORK.\nREAL PEOPLE.', accent: 'Built on trust', font: 'Impact', style: 'bold' },
  { name: 'Time for you', category: 'Beauty & Wellness', photo: 'wellness', headline: 'A moment\nfor yourself.', accent: 'Slow down. Feel good.', font: 'Georgia', style: 'editorial' },
  { name: 'Service highlight', category: 'Services', photo: 'trades', headline: 'Small details.\nA big difference.', accent: 'What we do best', font: 'Arial', style: 'modern' },
  { name: 'Appointments available', category: 'Booking', photo: 'wellness', headline: 'Appointments\navailable.', accent: 'Make time for you', font: 'Georgia', style: 'editorial' },
  { name: 'Come in today', category: 'Minimal Stories', photo: 'trades', headline: 'Come on in\ntoday.', accent: '', font: 'Georgia', style: 'minimal' },
  { name: 'Business hours', category: 'Minimal Stories', photo: 'studio', headline: 'We’re open\n7–7', accent: 'See you today', font: 'Arial', style: 'minimal' },
  { name: 'Book today', category: 'Minimal Stories', photo: 'wellness', headline: 'Book today.', accent: 'Your next chapter', font: 'cursive', style: 'organic' },
] as const;
export type StudioTemplate = typeof STUDIO_TEMPLATES[number];
export function createStudioTemplate(template: StudioTemplate, format: DesignFormat, colors: { background: string; ink: string; accent: string }): DesignDocument {
  const size = FORMATS[format];
  const vertical = format === 'story';
  const portrait = format === 'portrait';
  const headlineY = vertical ? .23 : portrait ? .24 : .25;
  const headlineSize = format === 'landscape' ? 54 : vertical ? 94 : portrait ? 78 : 68;
  const elements: DesignElement[] = [
    { id: crypto.randomUUID(), type: 'image', name: 'Replaceable business photo', sourceType: 'template-photo', templatePhoto: template.photo, assetId: null, x: .5, y: .5, width: size.width, height: size.height, opacity: 1, rotation: 0, crop: ratioCrop(2 / 3, size.width / size.height) },
    { id: crypto.randomUUID(), type: 'shape', name: 'Readable photo shade', shape: 'rectangle', x: .5, y: headlineY, width: size.width, height: size.height * (vertical ? .39 : .43), color: colors.background, opacity: .58, rotation: 0 },
    { id: crypto.randomUUID(), type: 'text', name: 'Headline', text: template.headline, fontFamily: template.font, fontRole: 'headline', fontSize: headlineSize, fontWeight: template.style === 'bold' ? 700 : 400, align: 'left', x: .09, y: headlineY, color: colors.ink, opacity: 1, rotation: 0 },
  ];
  if (template.accent) elements.push({ id: crypto.randomUUID(), type: 'text', name: 'Editable accent', text: template.accent, fontFamily: template.style === 'organic' ? 'cursive' : 'Arial', fontRole: 'accent', fontSize: format === 'landscape' ? 22 : 30, fontWeight: 400, align: 'left', x: .09, y: vertical ? .13 : .1, color: colors.ink, opacity: 1, rotation: 0 });
  elements.push({ id: crypto.randomUUID(), type: 'shape', name: 'Brand accent', shape: 'rectangle', x: .13, y: .87, width: size.width * .08, height: 6, color: colors.accent, opacity: 1, rotation: 0 });
  return { version: 1, format, background: colors.background, elements };
}
export function adaptStudioFormat(document: DesignDocument, next: DesignFormat): DesignDocument {
  const before = FORMATS[document.format], after = FORMATS[next];
  const scale = Math.min(after.width / before.width, after.height / before.height);
  return { ...document, format: next, elements: document.elements.map(element => element.type === 'text' ? { ...element, x: Math.min(.91, Math.max(.09, element.x)), y: Math.min(.85, Math.max(.12, element.y)), fontSize: Math.round(element.fontSize * scale) } : element.type === 'image' && element.name === 'Replaceable business photo' ? { ...element, width: after.width, height: after.height, crop: ratioCrop(2 / 3, after.width / after.height) } : { ...element, width: Math.round(element.width * after.width / before.width), height: Math.round(element.height * after.height / before.height) }) };
}
