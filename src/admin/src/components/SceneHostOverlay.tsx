import {
  HOST_INFO_SHEET_DEFAULT_SECTIONS,
  HOST_INFO_SHEET_TITLE,
} from '../../../platform/chrome/host-info-sheet'
import {
  HOST_BACK_ICON_SVG,
  HOST_INFO_ICON_SVG,
  HOST_SHARE_ICON_SVG,
} from '../../../platform/chrome/host-toolbar-icons'
import {
  HOST_TOOLBAR_SIDE_OFFSET_PX,
  HOST_TOOLBAR_TITLE_MAX_WIDTH_PX,
  HOST_TOOLBAR_TOP_GRADIENT,
  HOST_TOOLBAR_TOP_OFFSET_PX,
} from '../../../platform/chrome/host-toolbar-tokens'

export interface SceneHostOverlayState {
  src: string
  sceneId: string
  sceneTitle: string
  viewId: string
  viewTitle: string
  activationId: string
  chromeTextColor: string
}

interface Props {
  projectTitle: string
  activeScene: SceneHostOverlayState
  infoOpen: boolean
  onClose: () => void
  onShare: () => void
  onOpenInfo: () => void
  onCloseInfo: () => void
  children: JSX.Element
}

export function SceneHostOverlay({
  projectTitle,
  activeScene,
  infoOpen,
  onClose,
  onShare,
  onOpenInfo,
  onCloseInfo,
  children,
}: Props): JSX.Element {
  const sceneChromeColor = activeScene.chromeTextColor || '#FFFFFF'

  return (
    <div
      data-testid="scene-host-overlay"
      style={{
        position: 'absolute',
        inset: 0,
        background: '#020617',
        border: '1px solid rgba(148, 163, 184, 0.18)',
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          top: 0,
          height: 96,
          background: HOST_TOOLBAR_TOP_GRADIENT,
          pointerEvents: 'none',
          zIndex: 2,
        }}
      />
      <div
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          top: 0,
          zIndex: 3,
          pointerEvents: 'none',
        }}
      >
        <button
          type="button"
          onClick={onClose}
          aria-label="返回"
          style={{
            position: 'absolute',
            left: HOST_TOOLBAR_SIDE_OFFSET_PX,
            top: HOST_TOOLBAR_TOP_OFFSET_PX,
            width: 32,
            height: 32,
            border: '0',
            background: 'transparent',
            color: sceneChromeColor,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
            pointerEvents: 'auto',
          }}
          dangerouslySetInnerHTML={{ __html: HOST_BACK_ICON_SVG }}
        >
        </button>
        <div
          style={{
            position: 'absolute',
            left: '50%',
            top: HOST_TOOLBAR_TOP_OFFSET_PX,
            transform: 'translateX(-50%)',
            display: 'flex',
            alignItems: 'center',
            gap: 4,
            maxWidth: 'calc(100% - 120px)',
            pointerEvents: 'auto',
          }}
        >
          <div
            style={{
              minHeight: 24,
              maxWidth: HOST_TOOLBAR_TITLE_MAX_WIDTH_PX,
              fontSize: 17,
              lineHeight: '24px',
              fontWeight: 700,
              color: sceneChromeColor,
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
          >
            {projectTitle}
          </div>
          <button
            type="button"
            onClick={onOpenInfo}
            aria-label="提示信息"
            style={{
              width: 24,
              height: 24,
              border: '0',
              background: 'transparent',
              color: sceneChromeColor,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
            }}
            dangerouslySetInnerHTML={{ __html: HOST_INFO_ICON_SVG }}
          >
          </button>
        </div>
        <button
          type="button"
          onClick={onShare}
          aria-label="分享"
          style={{
            position: 'absolute',
            right: HOST_TOOLBAR_SIDE_OFFSET_PX,
            top: HOST_TOOLBAR_TOP_OFFSET_PX,
            width: 24,
            height: 24,
            border: '0',
            background: 'transparent',
            color: sceneChromeColor,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
            pointerEvents: 'auto',
          }}
          dangerouslySetInnerHTML={{ __html: HOST_SHARE_ICON_SVG }}
        >
        </button>
      </div>
      {children}
      {infoOpen ? (
        <>
          <div
            onClick={onCloseInfo}
            style={{
              position: 'absolute',
              inset: 0,
              background: 'rgba(0, 0, 0, 0.8)',
              zIndex: 4,
            }}
          />
          <div
            style={{
              position: 'absolute',
              left: 0,
              right: 0,
              bottom: 0,
              display: 'flex',
              flexDirection: 'column',
              gap: 16,
              padding: '18px 22px 24px',
              borderTopLeftRadius: 8,
              borderTopRightRadius: 8,
              background: '#FFFFFF',
              boxShadow: '0 -10px 36px rgba(15, 23, 42, 0.12)',
              zIndex: 5,
            }}
          >
            <div
              style={{
                position: 'relative',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                minHeight: 28,
              }}
            >
              <div
                style={{
                  fontWeight: 600,
                  fontSize: 16,
                  lineHeight: '22px',
                  color: 'rgba(0, 0, 0, 0.84)',
                }}
              >
                {HOST_INFO_SHEET_TITLE}
              </div>
              <button
                type="button"
                aria-label="关闭说明"
                onClick={onCloseInfo}
                style={{
                  position: 'absolute',
                  right: 0,
                  top: '50%',
                  transform: 'translateY(-50%)',
                  width: 28,
                  height: 28,
                  border: 'none',
                  borderRadius: 999,
                  background: 'transparent',
                  color: 'rgba(0, 0, 0, 0.36)',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                ×
              </button>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 18, overflowY: 'auto' }}>
              {HOST_INFO_SHEET_DEFAULT_SECTIONS.map((section) => (
                <section key={section.heading}>
                  <div
                    style={{
                      fontWeight: 700,
                      fontSize: 13,
                      lineHeight: '18px',
                      color: 'rgba(0, 0, 0, 0.84)',
                      marginBottom: 6,
                    }}
                  >
                    {section.heading}
                  </div>
                  <div
                    style={{
                      fontSize: 13,
                      lineHeight: '22px',
                      color: 'rgba(0, 0, 0, 0.72)',
                    }}
                  >
                    {section.body}
                  </div>
                </section>
              ))}
            </div>
          </div>
        </>
      ) : null}
    </div>
  )
}
