import SwiftUI

extension SoundModeSettingsView {
    /// 播放速度与音量控制区
     var playbackControlsSection: some View {
        VStack(alignment: .leading, spacing: AppTheme.mediumPadding) {
            // 播放速度控制行
            Button(action: {
                withAnimation(.easeInOut(duration: AppConfig.defaultAnimationDuration)) {
                    showingPlaybackRateControl.toggle()
                }
            }) {
                HStack {
                    Image(systemName: "forward.fill")
                        .foregroundColor(AppTheme.primaryColor)
                        .font(.system(size: AppTheme.smallIconSize))
                        .frame(width: AppTheme.iconSize, height: AppTheme.iconSize)

                    Text("播放速度")
                        .font(.appBody)
                        .foregroundColor(Color.textPrimary)

                    Spacer()

                    Text("\(config.playbackRate, specifier: "%.1f")x")
                        .font(.appSmall)
                        .foregroundColor(Color.gray)

                    Image(systemName: showingPlaybackRateControl ? "chevron.up" : "chevron.down")
                        .font(.appSmall)
                        .foregroundColor(Color.gray)
                }
                .standardRowStyle()
            }
            .buttonStyle(PlainButtonStyle())
            
            if showingPlaybackRateControl {
                VStack(spacing: AppTheme.smallPadding) {
                    Slider(value: $config.playbackRate, in: AppConfig.minPlaybackRate...AppConfig.maxPlaybackRate)
                    .accentColor(AppTheme.primaryColor)
                    HStack {
                        Text("\(String(format: "%.1f", AppConfig.minPlaybackRate))x")
                            .font(.appLabel)
                            .foregroundColor(Color.gray)
                        Spacer()
                        Text("\(String(format: "%.1f", AppConfig.maxPlaybackRate))x")
                            .font(.appLabel)
                            .foregroundColor(Color.gray)
                    }
                }
                .padding(.horizontal)
                .padding(.vertical, AppTheme.smallPadding)
                .cornerRadius(AppTheme.cornerRadius)
               .animation(.spring(response: 0.35, dampingFraction: 0.8), value: showingPlaybackRateControl)
            }
            
            // 音量控制行
            Button(action: {
                withAnimation(.easeInOut(duration: AppConfig.defaultAnimationDuration)) {
                    showingVolumeControl.toggle()
                }
            }) {
                HStack {
                    Image(systemName: config.volume > 1.0 ? "speaker.wave.3" : "speaker.wave.2")
                        .foregroundColor(config.volume > 1.0 ? AppTheme.warningColor : AppTheme.primaryColor)
                        .font(.system(size: AppTheme.smallIconSize))
                        .frame(width: AppTheme.iconSize, height: AppTheme.iconSize)

                    Text("音量")
                        .font(.appBody)
                        .foregroundColor(Color.textPrimary)

                    Spacer()

                    Text("\(Int(config.volume * 100))%")
                        .font(.appSmall)
                        .foregroundColor(Color.gray)

                    Image(systemName: showingVolumeControl ? "chevron.up" : "chevron.down")
                        .font(.appSmall)
                        .foregroundColor(Color.gray)
                }
                .standardRowStyle()
            }
            .buttonStyle(PlainButtonStyle())
            
            if showingVolumeControl {
                VStack(spacing: AppTheme.smallPadding) {
                    Slider(value: $config.volume, in: AppConfig.minVolume...AppConfig.maxVolume)
                    .accentColor(config.volume > 1.0 ? AppTheme.warningColor : AppTheme.primaryColor)
                    HStack {
                        Text("\(Int(AppConfig.minVolume * 100))%")
                            .font(.appLabel)
                            .foregroundColor(Color.gray)
                        Spacer()
                        Text("\(Int(AppConfig.maxVolume * 100))%")
                            .font(.appLabel)
                            .foregroundColor(Color.gray)
                    }
                }
                .padding(.horizontal)
                .padding(.vertical, AppTheme.smallPadding)
                .cornerRadius(AppTheme.cornerRadius)
               .animation(.spring(response: 0.35, dampingFraction: 0.8), value: showingVolumeControl)
            }
        }
    }
} 
