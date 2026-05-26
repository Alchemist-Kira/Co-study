"use client";

import { useEffect, useState, useRef } from "react";
import { Mic, MicOff, Settings, Volume2 } from "lucide-react";
import { supabase } from "@/lib/supabase";
import styles from "@/app/room/[id]/room.module.css";

const setupAudioAnalyzer = (stream: MediaStream, callback: (speaking: boolean) => void) => {
  try {
    const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
    const analyzer = audioContext.createAnalyser();
    analyzer.fftSize = 256;
    const source = audioContext.createMediaStreamSource(stream);
    source.connect(analyzer);
    
    const dataArray = new Uint8Array(analyzer.frequencyBinCount);
    let speaking = false;
    let animationFrame: number;

    const checkVolume = () => {
      analyzer.getByteFrequencyData(dataArray);
      let sum = 0;
      for (let i = 0; i < dataArray.length; i++) {
        sum += dataArray[i];
      }
      const average = sum / dataArray.length;
      
      const isNowSpeaking = average > 10;
      if (isNowSpeaking !== speaking) {
        speaking = isNowSpeaking;
        callback(speaking);
      }
      animationFrame = requestAnimationFrame(checkVolume);
    };
    
    checkVolume();
    return () => {
      cancelAnimationFrame(animationFrame);
      audioContext.close().catch(() => {});
    };
  } catch (err) {
    console.error("Audio analyzer error:", err);
    return () => {};
  }
};

export default function VoiceChat({
  roomId,
  userId,
  externalMuted,
  onMuteChange,
}: {
  roomId: string;
  userId: string | undefined;
  externalMuted?: boolean;
  onMuteChange?: (muted: boolean) => void;
}) {
  const [isMuted, setIsMuted] = useState(false);

  // Sync state with external mute controls (e.g. Theater mode controls)
  useEffect(() => {
    if (externalMuted !== undefined && externalMuted !== isMuted) {
      setIsMuted(externalMuted);
      if (localStreamRef.current) {
        localStreamRef.current.getAudioTracks().forEach((t) => (t.enabled = !externalMuted));
      }
    }
  }, [externalMuted]);
  const [isPushToTalk, setIsPushToTalk] = useState(false);
  const [pttKey, setPttKey] = useState("v");
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [peers, setPeers] = useState<string[]>([]);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [speakingPeers, setSpeakingPeers] = useState<{ [id: string]: boolean }>({});
  
  const localStreamRef = useRef<MediaStream | null>(null);
  const peerConnectionsRef = useRef<{ [key: string]: RTCPeerConnection }>({});
  const channelRef = useRef<any>(null);
  const analyzersRef = useRef<{ [key: string]: () => void }>({});

  // Key event listeners for Push to Talk
  useEffect(() => {
    if (!isPushToTalk) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (!localStreamRef.current) return;
      // Ignore if typing in an input
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      
      if (e.key.toLowerCase() === pttKey.toLowerCase() && isMuted) {
        setIsMuted(false);
        localStreamRef.current!.getAudioTracks().forEach(t => t.enabled = true);
        if (onMuteChange) onMuteChange(false);
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      if (!localStreamRef.current) return;
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

      if (e.key.toLowerCase() === pttKey.toLowerCase() && !isMuted) {
        setIsMuted(true);
        localStreamRef.current!.getAudioTracks().forEach(t => t.enabled = false);
        if (onMuteChange) onMuteChange(true);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
    };
  }, [isPushToTalk, pttKey, isMuted]);

  // Handle Auto-Talk vs Push-to-Talk Toggle Mute state
  useEffect(() => {
    if (localStreamRef.current) {
      if (isPushToTalk) {
        // Enforce mute by default when switching to PTT
        setIsMuted(true);
        localStreamRef.current.getAudioTracks().forEach(t => t.enabled = false);
        if (onMuteChange) onMuteChange(true);
      } else {
        // Unmute when switching to Auto-Talk
        setIsMuted(false);
        localStreamRef.current.getAudioTracks().forEach(t => t.enabled = true);
        if (onMuteChange) onMuteChange(false);
      }
    }
  }, [isPushToTalk]);

  // WebRTC Setup
  useEffect(() => {
    if (!userId || !roomId) return;

    const initWebRTC = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        stream.getAudioTracks().forEach(t => t.enabled = !isPushToTalk);
        localStreamRef.current = stream;

        analyzersRef.current['local'] = setupAudioAnalyzer(stream, setIsSpeaking);

        // Cleanup any existing channel for this room to avoid strict-mode subscribe errors
        const topicName = `webrtc-${roomId}`;
        const existingChannel = supabase.getChannels().find(c => c.topic === `realtime:${topicName}`);
        if (existingChannel) {
          await supabase.removeChannel(existingChannel);
        }

        const channel = supabase.channel(topicName);
        channelRef.current = channel;

        channel.on('presence', { event: 'sync' }, () => {
          const state = channel.presenceState();
          const presentUsers = Object.keys(state);
          setPeers(presentUsers.filter(id => id !== userId));
        });

        channel.on('broadcast', { event: 'signal' }, async ({ payload }) => {
          if (payload.target !== userId) return;
          
          let pc = peerConnectionsRef.current[payload.sender];
          
          if (!pc) {
            pc = new RTCPeerConnection({ iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] });
            peerConnectionsRef.current[payload.sender] = pc;
            
            stream.getTracks().forEach(track => pc.addTrack(track, stream));
            
            pc.ontrack = (event) => {
              let audio = document.getElementById(`audio-${payload.sender}`) as HTMLAudioElement;
              if (!audio) {
                audio = document.createElement('audio');
                audio.id = `audio-${payload.sender}`;
                audio.autoplay = true;
                document.body.appendChild(audio);
              }
              audio.srcObject = event.streams[0];
              
              if (analyzersRef.current[payload.sender]) {
                analyzersRef.current[payload.sender]();
              }
              analyzersRef.current[payload.sender] = setupAudioAnalyzer(event.streams[0], (speaking) => {
                setSpeakingPeers(prev => ({ ...prev, [payload.sender]: speaking }));
              });
            };

            pc.onicecandidate = (event) => {
              if (event.candidate) {
                channel.send({
                  type: 'broadcast', event: 'signal',
                  payload: { type: 'ice', candidate: event.candidate, sender: userId, target: payload.sender }
                });
              }
            };
          }

          if (payload.type === 'offer') {
            await pc.setRemoteDescription(new RTCSessionDescription(payload.offer));
            const answer = await pc.createAnswer();
            await pc.setLocalDescription(answer);
            channel.send({
              type: 'broadcast', event: 'signal',
              payload: { type: 'answer', answer, sender: userId, target: payload.sender }
            });
          } else if (payload.type === 'answer') {
            await pc.setRemoteDescription(new RTCSessionDescription(payload.answer));
          } else if (payload.type === 'ice') {
            await pc.addIceCandidate(new RTCIceCandidate(payload.candidate));
          }
        });

        channel.on('broadcast', { event: 'peer-join' }, async ({ payload }) => {
          if (payload.sender === userId) return;
          
          let pc = peerConnectionsRef.current[payload.sender];
          
          if (!pc) {
            pc = new RTCPeerConnection({ iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] });
            peerConnectionsRef.current[payload.sender] = pc;
            
            stream.getTracks().forEach(track => pc.addTrack(track, stream));
            
            pc.ontrack = (event) => {
              let audio = document.getElementById(`audio-${payload.sender}`) as HTMLAudioElement;
              if (!audio) {
                audio = document.createElement('audio');
                audio.id = `audio-${payload.sender}`;
                audio.autoplay = true;
                document.body.appendChild(audio);
              }
              audio.srcObject = event.streams[0];
            };

            pc.onicecandidate = (event) => {
              if (event.candidate) {
                channel.send({
                  type: 'broadcast', event: 'signal',
                  payload: { type: 'ice', candidate: event.candidate, sender: userId, target: payload.sender }
                });
              }
            };
          }

          const offer = await pc.createOffer();
          await pc.setLocalDescription(offer);
          channel.send({
            type: 'broadcast', event: 'signal',
            payload: { type: 'offer', offer, sender: userId, target: payload.sender }
          });
        });

        channel.subscribe(async (status) => {
          if (status === 'SUBSCRIBED') {
            await channel.track({ online_at: new Date().toISOString() });
            
            // Announce presence so existing peers can send connection offers
            channel.send({
              type: 'broadcast',
              event: 'peer-join',
              payload: { sender: userId }
            });
          }
        });
      } catch (err) {
        console.error("Mic access denied or error:", err);
      }
    };

    initWebRTC();

    return () => {
      if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach(t => t.stop());
      }
      Object.values(peerConnectionsRef.current).forEach(pc => pc.close());
      Object.values(analyzersRef.current).forEach(cleanup => cleanup());
      if (channelRef.current) supabase.removeChannel(channelRef.current);
    };
  }, [roomId, userId]);

  return (
    <div className={styles.panelCard}>
      <div className={styles.panelHeader}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <Volume2 size={16} style={{ color: 'var(--accent-teal)' }} />
          <span>Voice Chat</span>
        </div>
        <button onClick={() => setIsSettingsOpen(!isSettingsOpen)} className={styles.backBtn} style={{ padding: 0 }}>
          <Settings size={16} />
        </button>
      </div>

      <div className={styles.voiceControls}>
        {isSettingsOpen && (
          <div className={styles.settingsCard}>
            <div className={styles.controlRow}>
              <span>Mode</span>
              <div className={styles.toggleSwitch}>
                <button 
                  onClick={() => setIsPushToTalk(true)}
                  className={`${styles.switchBtn} ${isPushToTalk ? styles.active : ''}`}
                >
                  PTT
                </button>
                <button 
                  onClick={() => setIsPushToTalk(false)}
                  className={`${styles.switchBtn} ${!isPushToTalk ? styles.active : ''}`}
                >
                  Auto
                </button>
              </div>
            </div>
            {isPushToTalk && (
              <div className={styles.controlRow}>
                <span>Keybind</span>
                <input 
                  type="text" 
                  value={pttKey.toUpperCase()} 
                  onChange={(e) => setPttKey(e.target.value.charAt(e.target.value.length - 1) || 'V')}
                  className={styles.pttInput}
                />
              </div>
            )}
          </div>
        )}

        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '1.5rem 0' }}>
          <button 
            className={`${styles.micBtn} ${isMuted ? styles.muted : styles.active} ${isSpeaking && !isMuted ? styles.speakingPulse : ''}`}
            onClick={() => {
              if (!isPushToTalk) {
                const newMutedState = !isMuted;
                setIsMuted(newMutedState);
                if (localStreamRef.current) {
                  localStreamRef.current.getAudioTracks().forEach(t => t.enabled = !newMutedState);
                }
                if (onMuteChange) onMuteChange(newMutedState);
              }
            }}
          >
            {isMuted ? <MicOff size={24} /> : <Mic size={24} />}
            {isMuted ? 'Muted' : 'Speaking'}
          </button>
          
          {isPushToTalk && (
            <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '1rem' }}>
              Hold <strong style={{ color: 'var(--accent-teal)', textTransform: 'uppercase' }}>{pttKey}</strong> to speak
            </p>
          )}
        </div>
        
        <div style={{ borderTop: '1px solid var(--border-color)', paddingTop: '0.75rem', marginTop: 'auto' }}>
          <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '0.75rem' }}>Connected Peers ({peers.length})</p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
            {peers.map((p) => (
              <div 
                key={p} 
                className={`${styles.peerDot} ${speakingPeers[p] ? styles.speakingPulse + ' ' + styles.speaking : ''}`}
                title="Peer"
              >
                {p.substring(0, 2).toUpperCase()}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
