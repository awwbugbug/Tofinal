import { useEffect, useState } from "react";
import { ImageOff, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { useI18n } from "@/i18n/useI18n";
import type { AttachmentView } from "@/stores/attachmentStore";

type AttachmentLightboxProps = {
  attachment: AttachmentView;
  onClose: () => void;
};

const CLOSE_ANIMATION_MS = 190;

export function AttachmentLightbox({ attachment, onClose }: AttachmentLightboxProps) {
  const { t } = useI18n();
  const [closing, setClosing] = useState(false);
  const [broken, setBroken] = useState(attachment.missing);

  const requestClose = () => {
    if (closing) {
      return;
    }

    setClosing(true);
    window.setTimeout(onClose, CLOSE_ANIMATION_MS);
  };

  useEffect(() => {
    setBroken(attachment.missing);
    setClosing(false);
  }, [attachment]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        requestClose();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  });

  return (
    <div
      aria-label={`Image preview ${attachment.originalName}`}
      aria-modal="true"
      className="attachment-lightbox"
      data-closing={closing}
      role="dialog"
    >
      <button
        aria-label={t("lightbox.backdrop")}
        className="attachment-lightbox-backdrop"
        data-testid="attachment-lightbox-backdrop"
        onClick={requestClose}
        type="button"
      />
      <div className="attachment-lightbox-panel" onClick={(event) => event.stopPropagation()}>
        <div className="attachment-lightbox-toolbar">
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-white">{attachment.originalName}</p>
            <p className="text-xs text-white/60">{t("lightbox.localCopied")}</p>
          </div>
          <Button
            aria-label={t("lightbox.close")}
            className="bg-white/12 text-white hover:bg-white/20 hover:text-white"
            onClick={requestClose}
            size="icon"
            type="button"
            variant="ghost"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>

        <div className="attachment-lightbox-image-frame">
          {!broken && attachment.url ? (
            <img
              alt={attachment.originalName}
              className="attachment-lightbox-image"
              onError={() => setBroken(true)}
              src={attachment.url}
            />
          ) : (
            <div className="attachment-lightbox-missing">
              <ImageOff className="h-8 w-8" />
              <span>{t("lightbox.unableToPreview")}</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
