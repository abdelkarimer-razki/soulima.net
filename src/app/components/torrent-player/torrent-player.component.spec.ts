import { ComponentFixture, TestBed } from '@angular/core/testing';
import { HttpClientTestingModule } from '@angular/common/http/testing';
import { TorrentPlayerComponent } from './torrent-player.component';
import { TorrentService, TorrentSource } from '../../services/torrent.service';
import { SubtitleService } from '../../services/subtitle.service';
import { OfflineStorageService } from '../../services/offline-storage.service';

describe('TorrentPlayerComponent', () => {
  let component: TorrentPlayerComponent;
  let fixture: ComponentFixture<TorrentPlayerComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [TorrentPlayerComponent],
      imports: [HttpClientTestingModule],
      providers: [TorrentService, SubtitleService, OfflineStorageService]
    }).compileComponents();

    fixture = TestBed.createComponent(TorrentPlayerComponent);
    component = fixture.componentInstance;
  });

  it('should create the torrent player component', () => {
    expect(component).toBeTruthy();
  });

  describe('sourceKey extraction', () => {
    it('should extract lowercase hex infoHash from standard urn:btih magnet', () => {
      const source: TorrentSource = {
        quality: '1080p',
        magnet: 'magnet:?xt=urn:btih:4A5B6C7D8E9F0123456789ABCDEF0123456789AB&dn=Test.Movie'
      };
      const key = (component as any).sourceKey(source);
      expect(key).toBe('4a5b6c7d8e9f0123456789abcdef0123456789ab');
    });

    it('should extract infoHash from magnets with btih before or after other query params', () => {
      const source: TorrentSource = {
        quality: '720p',
        magnet: 'magnet:?dn=Test.Show&tr=udp%3A%2F%2Ftracker&xt=urn:btih:11223344556677889900aabbccddeeff00112233'
      };
      const key = (component as any).sourceKey(source);
      expect(key).toBe('11223344556677889900aabbccddeeff00112233');
    });

    it('should fallback to quality or empty string if magnet is missing or malformed', () => {
      expect((component as any).sourceKey(null)).toBe('');
      expect((component as any).sourceKey({ quality: '480p', magnet: '' })).toBe('480p');
    });
  });

  describe('virtual timeline and native seeking', () => {
    it('should seek within video.seekable using relTarget without resetting stream', () => {
      component.knownDuration = 120;
      (component as any).streamStartTime = 20;

      const mockVideo: any = {
        currentTime: 5,
        duration: 100,
        buffered: {
          length: 1,
          start: () => 0,
          end: () => 50,
        },
        seekable: {
          length: 1,
          start: () => 0,
          end: () => 100,
        }
      };

      component.videoRef = { nativeElement: mockVideo } as any;

      // Seeking to target 45s (relTarget = 45 - 20 = 25s, which is within seekable 0..100)
      component.performSeek(45);

      expect(mockVideo.currentTime).toBe(25);
      expect(component.currentTime).toBe(45);
    });

    it('should not save resume timestamps while user is scrubbing', () => {
      localStorage.removeItem('soulima_resume:movie:999');
      component.info = 'Test Movie (2024)';
      component.isScrubbing = true;
      component.currentTime = 50;
      component.knownDuration = 100;

      (component as any).saveResume();

      const saved = localStorage.getItem('soulima_resume:movie:999');
      expect(saved).toBeNull();
    });
  });

  describe('subtitle cue parsing and delay offset synchronization', () => {
    it('should parse VTT cues and lookup cue text at given playback second', () => {
      const vtt = `WEBVTT

1
00:00:10.000 --> 00:00:15.000
Hello World

2
00:00:20.000 --> 00:00:25.000
Second Subtitle Line
`;
      (component as any).parsedCues = (component as any).parseVttCues(vtt);

      component.currentTime = 12;
      (component as any).updateActiveSubtitleText();
      expect(component.activeSubtitleText).toBe('Hello World');

      component.currentTime = 18;
      (component as any).updateActiveSubtitleText();
      expect(component.activeSubtitleText).toBe('');

      // Applying positive offset: user says subtitle is 3s early
      component.subtitleOffset = 3;
      component.currentTime = 15; // 15 - 3 = 12, falls within 10..15
      (component as any).updateActiveSubtitleText();
      expect(component.activeSubtitleText).toBe('Hello World');
    });
  });
});
