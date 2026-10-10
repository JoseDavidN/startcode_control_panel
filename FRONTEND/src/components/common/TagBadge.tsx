import { TAG_TONES, tagLabel, type ResourceTag } from '@utils/tags';

/** Etiqueta de un servidor o una conexión; sin etiqueta no pinta nada. */
export const TagBadge = ({ tag }: { tag: ResourceTag | null | undefined }) => tag ? (
  <span className={`text-[11px] font-medium px-2 py-0.5 rounded-full ring-1 shrink-0 ${TAG_TONES[tag]}`}>
    {tagLabel(tag)}
  </span>
) : null;
