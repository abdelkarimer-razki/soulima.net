import numpy as np
import wave
import math

def generate_soundtrack(filename="docs/soundtrack.wav", duration=48.0, sr=44100):
    total_samples = int(duration * sr)
    t = np.linspace(0, duration, total_samples, False)
    
    # 120 BPM -> 1 beat = 0.5s, 1 bar = 2.0s
    bpm = 120.0
    beat_sec = 60.0 / bpm
    bar_sec = beat_sec * 4.0
    
    # Audio buffer (stereo)
    left = np.zeros(total_samples, dtype=np.float32)
    right = np.zeros(total_samples, dtype=np.float32)
    
    # 1. Kick Drum (every beat: 0.0, 0.5, 1.0, 1.5...)
    # Skip kick during first 2 seconds intro
    kick_samples = int(0.25 * sr)
    t_kick = np.linspace(0, 0.25, kick_samples, False)
    # Pitch drop from 150 Hz to 40 Hz
    kick_pitch = 40.0 + 110.0 * np.exp(-t_kick * 30.0)
    kick_phase = 2 * np.pi * np.cumsum(kick_pitch) / sr
    kick_env = np.exp(-t_kick * 14.0)
    kick_wave = np.sin(kick_phase) * kick_env * 0.75
    
    # 2. Snare / Clap (on beats 2 and 4: 0.5s, 1.5s in each bar)
    snare_samples = int(0.2 * sr)
    t_snare = np.linspace(0, 0.2, snare_samples, False)
    snare_noise = np.random.uniform(-1, 1, snare_samples) * np.exp(-t_snare * 20.0)
    snare_tone = np.sin(2 * np.pi * 180 * t_snare) * np.exp(-t_snare * 25.0)
    snare_wave = (snare_noise * 0.4 + snare_tone * 0.25) * 0.6
    
    # 3. Hi-Hat (every 1/8 note = 0.25s)
    hihat_samples = int(0.06 * sr)
    t_hihat = np.linspace(0, 0.06, hihat_samples, False)
    hihat_wave = np.random.uniform(-1, 1, hihat_samples) * np.exp(-t_hihat * 70.0) * 0.18
    
    # Populate drums across timeline
    for beat in range(int(duration / beat_sec)):
        start_idx = int(beat * beat_sec * sr)
        beat_in_bar = beat % 4
        
        # Kick on beats 0, 1, 2, 3 (four on the floor after 4s)
        if beat * beat_sec >= 4.0 and beat * beat_sec < (duration - 3.0):
            k_end = min(start_idx + kick_samples, total_samples)
            k_len = k_end - start_idx
            left[start_idx:k_end] += kick_wave[:k_len]
            right[start_idx:k_end] += kick_wave[:k_len]
        
        # Snare on beats 1 and 3 (0-indexed: beat 1 and beat 3)
        if beat * beat_sec >= 4.0 and beat * beat_sec < (duration - 3.0):
            if beat_in_bar in [1, 3]:
                s_end = min(start_idx + snare_samples, total_samples)
                s_len = s_end - start_idx
                left[start_idx:s_end] += snare_wave[:s_len]
                right[start_idx:s_end] += snare_wave[:s_len]
                
        # Hi-hats
        if beat * beat_sec >= 7.5 and beat * beat_sec < (duration - 3.0):
            h_end = min(start_idx + hihat_samples, total_samples)
            h_len = h_end - start_idx
            left[start_idx:h_end] += hihat_wave[:h_len] * 0.8
            right[start_idx:h_end] += hihat_wave[:h_len] * 0.8
            
            # Offbeat hat (1/8th note)
            off_idx = start_idx + int(0.25 * sr)
            if off_idx + hihat_samples < total_samples:
                left[off_idx:off_idx+hihat_samples] += hihat_wave * 0.6
                right[off_idx:off_idx+hihat_samples] += hihat_wave * 0.6
                
    # 4. Synth Bass (Cyberpunk / Tech Sawtooth with lowpass filter)
    # Bass progression (in D minor: D1, F1, G1, A#1)
    notes_freq = {
        'D1': 36.71, 'F1': 43.65, 'G1': 48.99, 'A#1': 58.27,
        'D2': 73.42, 'F2': 87.31, 'G2': 97.99, 'C2': 65.41
    }
    bass_prog = ['D1', 'D1', 'F1', 'G1', 'A#1', 'A#1', 'G1', 'F1']
    
    bass_track = np.zeros(total_samples, dtype=np.float32)
    for i, t_val in enumerate(t):
        if t_val < 3.5 or t_val > (duration - 2.0):
            continue
        bar_num = int(t_val / bar_sec)
        note_name = bass_prog[bar_num % len(bass_prog)]
        freq = notes_freq[note_name]
        
        # 16th note pulse envelope (sidechain pump)
        pulse = (t_val % 0.25) / 0.25
        env = (1.0 - np.exp(-pulse * 8.0)) * np.exp(-pulse * 2.5)
        
        # Sawtooth wave + sub sine
        saw = 2.0 * ((t_val * freq) % 1.0) - 1.0
        sub = np.sin(2 * np.pi * (freq / 2.0) * t_val)
        
        bass_track[i] = (saw * 0.4 + sub * 0.6) * env * 0.35
        
    left += bass_track * 0.95
    right += bass_track * 0.95
    
    # 5. Tech Arpeggio (Plucky sine/triangle chords)
    arp_notes = [
        # Dm: D4, F4, A4, D5
        293.66, 349.23, 440.00, 587.33,
        # F: F4, A4, C5, F5
        349.23, 440.00, 523.25, 698.46,
        # G: G4, Bb4, D5, G5
        392.00, 466.16, 587.33, 783.99,
        # Bb: Bb4, D5, F5, Bb5
        466.16, 587.33, 698.46, 932.33
    ]
    
    arp_track_l = np.zeros(total_samples, dtype=np.float32)
    arp_track_r = np.zeros(total_samples, dtype=np.float32)
    arp_step = 0.125 # 16th note
    for step in range(int(duration / arp_step)):
        t_start = step * arp_step
        if t_start < 0.5 or t_start > (duration - 2.0):
            continue
        note_idx = (step % 4) + ((int(t_start / bar_sec) % 4) * 4)
        freq = arp_notes[note_idx % len(arp_notes)]
        
        # Arp note envelope
        arp_len = int(0.18 * sr)
        idx_start = int(t_start * sr)
        idx_end = min(idx_start + arp_len, total_samples)
        length = idx_end - idx_start
        t_note = np.linspace(0, 0.18, arp_len, False)[:length]
        
        env = np.exp(-t_note * 18.0)
        # Gentle stereo ping-pong
        pan = math.sin(step * 0.7) * 0.4 + 0.5 # 0.1 to 0.9
        tone = (np.sin(2 * np.pi * freq * t_note) + 0.3 * np.sin(2 * np.pi * freq * 2 * t_note)) * env * 0.22
        
        arp_track_l[idx_start:idx_end] += tone * (1.0 - pan)
        arp_track_r[idx_start:idx_end] += tone * pan
        
    left += arp_track_l
    right += arp_track_r
    
    # 6. Scene Transition Riser / Sweep (at t=7.0, 15.5, 25.5, 36.5, 42.5)
    transition_times = [7.0, 15.5, 25.5, 36.5, 42.5]
    for trans_t in transition_times:
        riser_len = int(1.2 * sr)
        idx_start = int((trans_t - 1.2) * sr)
        if idx_start >= 0 and idx_start + riser_len < total_samples:
            t_rise = np.linspace(0, 1.2, riser_len, False)
            freq_rise = 120.0 + 1200.0 * (t_rise / 1.2) ** 2
            phase = 2 * np.pi * np.cumsum(freq_rise) / sr
            env_rise = (t_rise / 1.2) ** 2 * 0.25
            noise_rise = np.random.uniform(-1, 1, riser_len) * env_rise * 0.15
            rise_sig = (np.sin(phase) * env_rise + noise_rise)
            left[idx_start:idx_start+riser_len] += rise_sig
            right[idx_start:idx_start+riser_len] += rise_sig
            
    # Master Fade In & Fade Out
    fade_in = np.minimum(1.0, np.linspace(0, 1.0, int(1.5 * sr)))
    fade_out = np.minimum(1.0, np.linspace(1.0, 0, int(2.5 * sr)))
    left[:len(fade_in)] *= fade_in
    right[:len(fade_in)] *= fade_in
    left[-len(fade_out):] *= fade_out
    right[-len(fade_out):] *= fade_out
    
    # Master limiter / normalization
    max_val = max(np.max(np.abs(left)), np.max(np.abs(right)), 0.001)
    scale = 0.88 / max_val
    left = np.clip(left * scale, -1.0, 1.0)
    right = np.clip(right * scale, -1.0, 1.0)
    
    # Interleave 16-bit PCM
    left_i16 = (left * 32767).astype(np.int16)
    right_i16 = (right * 32767).astype(np.int16)
    stereo = np.empty((total_samples * 2,), dtype=np.int16)
    stereo[0::2] = left_i16
    stereo[1::2] = right_i16
    
    with wave.open(filename, 'w') as wf:
        wf.setnchannels(2)
        wf.setsampwidth(2)
        wf.setframerate(sr)
        wf.writeframes(stereo.tobytes())
    print(f"Soundtrack generated: {filename} ({duration}s, {sr}Hz)")

if __name__ == "__main__":
    generate_soundtrack()
