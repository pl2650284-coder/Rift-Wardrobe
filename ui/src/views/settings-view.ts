import { currentAccentHex, isHexColor, PRESET_ACCENTS, type ThemeMode } from "../theme";

export type SettingsViewProps = {
  themeMode: ThemeMode;
  accentColor: string;
  compactMode: boolean;
  animationsEnabled: boolean;
  autoPopupCompanion: boolean;
  companionAlwaysOnTop: boolean;
  autoAccept: boolean;
  autoSkin: boolean;
  notifyEnabled: boolean;
  launchAtStartup: boolean;
  preferenceRow: (key: string, title: string, checked: boolean) => string;
  autoAcceptDelaySelect: () => string;
  escape: (value: string) => string;
  icon: (name: string, size?: number) => string;
};

export function renderSettingsView({
  themeMode,
  accentColor,
  compactMode,
  animationsEnabled,
  autoPopupCompanion,
  companionAlwaysOnTop,
  autoAccept,
  autoSkin,
  notifyEnabled,
  launchAtStartup,
  preferenceRow,
  autoAcceptDelaySelect,
  escape,
  icon,
}: SettingsViewProps): string {
  const customActive = isHexColor(accentColor);
  const pickerHex = currentAccentHex(accentColor);
  return `
    <section class="settings-layout">
      <div class="settings-column">
        <article class="settings-panel">
          <header class="panel-heading"><div><h2>外观</h2></div></header>
          <div class="preference-content">
            <div class="preference-row preference-row--static">
              <span><strong>主题模式</strong></span>
              <div class="theme-choice">
                <button class="theme-option ${themeMode === "system" ? "theme-option--active" : ""}" data-theme="system">${icon("monitor", 13)}跟随系统</button>
                <button class="theme-option ${themeMode === "dark" ? "theme-option--active" : ""}" data-theme="dark">${icon("moon", 13)}深色</button>
                <button class="theme-option ${themeMode === "light" ? "theme-option--active" : ""}" data-theme="light">${icon("sun", 13)}浅色</button>
              </div>
            </div>
            <div class="preference-row preference-row--static">
              <span><strong>主题颜色</strong></span>
              <div class="accent-controls">
                <div class="accent-choice">
                  ${PRESET_ACCENTS.map((c) => `<button class="accent-swatch accent-swatch--${c.id} ${accentColor === c.id ? "accent-swatch--active" : ""}" data-accent="${c.id}" aria-label="${c.label}" title="${c.label}"></button>`).join("")}
                </div>
                <label class="custom-color-picker ${customActive ? "is-active" : ""}" title="自定义主题颜色">
                  <input type="color" value="${escape(pickerHex)}" data-custom-accent aria-label="自定义主题颜色" />
                  <span class="num">${customActive ? escape(pickerHex.toUpperCase()) : "自定义"}</span>
                </label>
              </div>
            </div>
            ${preferenceRow("compact", "紧凑布局", compactMode)}
            ${preferenceRow("animations", "界面动效", animationsEnabled)}
          </div>
        </article>
        <article class="settings-panel">
          <header class="panel-heading"><div><h2>数据</h2></div></header>
          <div class="preference-content">
            <div class="preference-row preference-row--button">
              <span><strong>图片缓存</strong></span>
              <button class="secondary-button" data-action="clear-image-cache">清理缓存</button>
            </div>
            <div class="preference-row preference-row--button">
              <span><strong>恢复默认设置</strong></span>
              <button class="secondary-button" data-action="reset-preferences">恢复默认</button>
            </div>
          </div>
        </article>
      </div>
      <div class="settings-column">
        <article class="settings-panel">
          <header class="panel-heading"><div><h2>辅助与小窗</h2></div></header>
          <div class="preference-content">
            ${preferenceRow("autoPopupCompanion", "选人时自动弹出小窗", autoPopupCompanion)}
            ${preferenceRow("companionPin", "伴随小窗悬浮显示", companionAlwaysOnTop)}
            ${preferenceRow("autoAccept", "自动接受对局", autoAccept)}
            <div class="preference-row"><span><strong>自动接受延迟</strong></span>${autoAcceptDelaySelect()}</div>
            ${preferenceRow("autoSkin", "自动应用上次皮肤", autoSkin)}
            ${preferenceRow("notify", "桌面通知", notifyEnabled)}
            ${preferenceRow("launchAtStartup", "开机启动", launchAtStartup)}
          </div>
        </article>
      </div>
    </section>`;
}
