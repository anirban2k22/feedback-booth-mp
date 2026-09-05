'use client';

import { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { supabase } from '@/lib/supabase';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import {
  Mic, Square, Play, RotateCcw, Send,
  CheckCircle2, ChevronRight, AlertCircle,
  Loader2, PenLine
} from 'lucide-react';
import { v4 as uuidv4 } from 'uuid';

type Step = 'welcome' | 'role' | 'rating' | 'struggle' | 'voice' | 'success';

const roles = ['Mentee', 'Mentor', 'Admin'];

const ratings = [
  { value: 'Very difficult', emoji: '😖' },
  { value: 'Difficult', emoji: '😕' },
  { value: 'Okay', emoji: '😐' },
  { value: 'Easy', emoji: '🙂' },
  { value: 'Super easy', emoji: '😍' },
];

const struggles = [
  'Login / OTP',
  'Finding my mentor or mentee',
  'Booking sessions',
  'Joining meetings',
  'Profile setup',
  "Didn't know what to do next",
  'Navigating the dashboard',
  'Understanding session status',
  'Receiving or sending messages',
  'Uploading documents or resources',
  'Setting availability / calendar',
  'Technical issues / bugs',
  'App felt slow or unresponsive',
  'Other',
];

const MAX_TEXT_LENGTH = 300;

export default function FeedbackBooth() {
  const [step, setStep] = useState<Step>('welcome');
  const [deviceId, setDeviceId] = useState('');

  // Form State
  const [role, setRole] = useState('');
  const [easeRating, setEaseRating] = useState('');
  const [struggleArea, setStruggleArea] = useState('');

  // Audio State
  const [isRecording, setIsRecording] = useState(false);
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [recordingTime, setRecordingTime] = useState(30);
  const [transcript, setTranscript] = useState('');

  // Text fallback state
  const [showTyping, setShowTyping] = useState(false);
  const [typedFeedback, setTypedFeedback] = useState('');

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const recognitionRef = useRef<any>(null);

  useEffect(() => {
    let id = localStorage.getItem('device_id');
    if (!id) {
      id = uuidv4();
      localStorage.setItem('device_id', id);
    }
    setDeviceId(id);

    if (
      typeof window !== 'undefined' &&
      ('SpeechRecognition' in window || 'webkitSpeechRecognition' in window)
    ) {
      const SR =
        (window as any).SpeechRecognition ||
        (window as any).webkitSpeechRecognition;
      recognitionRef.current = new SR();
      recognitionRef.current.continuous = true;
      recognitionRef.current.interimResults = true;
      recognitionRef.current.onresult = (event: any) => {
        let t = '';
        for (let i = 0; i < event.results.length; i++) {
          t += event.results[i][0].transcript;
        }
        setTranscript(t);
      };
    }
  }, []);

  useEffect(() => {
    if (step === 'success') {
      const t = setTimeout(resetForm, 3000);
      return () => clearTimeout(t);
    }
  }, [step]);

  const resetForm = () => {
    setStep('welcome');
    setRole('');
    setEaseRating('');
    setStruggleArea('');
    setAudioBlob(null);
    setAudioUrl(null);
    setTranscript('');
    setTypedFeedback('');
    setShowTyping(false);
    setRecordingTime(30);
    setError(null);
  };

  const startRecording = async () => {
    try {
      setError(null);
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mr = new MediaRecorder(stream);
      mediaRecorderRef.current = mr;
      audioChunksRef.current = [];

      mr.ondataavailable = (e) => {
        if (e.data.size > 0) audioChunksRef.current.push(e.data);
      };
      mr.onstop = () => {
        const blob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        setAudioBlob(blob);
        setAudioUrl(URL.createObjectURL(blob));
        stream.getTracks().forEach((t) => t.stop());
      };

      mr.start();
      setIsRecording(true);
      setRecordingTime(30);

      if (recognitionRef.current) {
        try { recognitionRef.current.start(); } catch (_) {}
      }

      timerRef.current = setInterval(() => {
        setRecordingTime((prev) => {
          if (prev <= 1) {
            stopRecording();
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    } catch (err) {
      setError(
        'Microphone access denied. Please allow microphone access, or type your feedback below.'
      );
      setShowTyping(true);
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      if (timerRef.current) clearInterval(timerRef.current);
      if (recognitionRef.current) {
        try { recognitionRef.current.stop(); } catch (_) {}
      }
    }
  };

  const discardRecording = () => {
    setAudioBlob(null);
    setAudioUrl(null);
    setTranscript('');
    setRecordingTime(30);
  };

  // Determine if submission is valid
  const canSubmit = !!audioBlob || typedFeedback.trim().length > 0;

  const submitFeedback = async (skip = false) => {
    setIsSubmitting(true);
    setError(null);

    // If Supabase env vars aren't configured, just show success without persisting.
    const supabaseConfigured =
      process.env.NEXT_PUBLIC_SUPABASE_URL &&
      process.env.NEXT_PUBLIC_SUPABASE_URL !== 'https://placeholder.supabase.co';

    if (!supabaseConfigured) {
      // Graceful no-op — kiosk still shows success
      setStep('success');
      setIsSubmitting(false);
      return;
    }

    try {
      let uploadedAudioUrl: string | null = null;
      const durationSeconds = 30 - recordingTime;

      if (audioBlob && !skip) {
        const fileName = `${new Date().getFullYear()}/${new Date().getMonth() + 1}/${new Date().getDate()}/${uuidv4()}.webm`;
        const { data: uploadData, error: uploadError } = await supabase.storage
          .from('voice-feedback')
          .upload(fileName, audioBlob, { contentType: 'audio/webm' });

        if (!uploadError && uploadData) {
          const { data: publicUrlData } = supabase.storage
            .from('voice-feedback')
            .getPublicUrl(fileName);
          uploadedAudioUrl = publicUrlData.publicUrl;
        }
      }

      // Use typed feedback as transcript if no voice recording
      const finalTranscript = skip
        ? ''
        : transcript || typedFeedback.trim();

      const { error: dbError } = await supabase
        .from('feedback_responses')
        .insert([{
          role,
          ease_rating: easeRating,
          struggle_area: struggleArea,
          transcript: finalTranscript,
          audio_url: uploadedAudioUrl,
          duration_seconds: skip ? 0 : durationSeconds,
          device_id: deviceId,
        }]);

      if (dbError) throw dbError;

      setStep('success');
    } catch (err: any) {
      console.error('Submission error:', err);
      setError('Submission failed. Your feedback is still appreciated!');
      // After 2 sec auto-advance anyway — kiosk must not get stuck
      setTimeout(() => setStep('success'), 2000);
    } finally {
      setIsSubmitting(false);
    }
  };

  // ─── Screens ──────────────────────────────────────────────────────────────

  const renderWelcome = () => (
    <motion.div
      initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }}
      className="flex flex-col items-center justify-center text-center space-y-8 px-4"
    >
      {/* Logo */}
      <img
        src="/tie-logo.jpg"
        alt="TiE Bangalore Mentoring Platform"
        className="w-64 md:w-80 object-contain"
      />

      <div className="space-y-4">
        <h1 className="text-5xl font-bold tracking-tight text-slate-900 dark:text-white">
          Help us improve the{' '}
          <span className="font-extrabold text-red-400 uppercase tracking-wide">
            Mentoring Platform
          </span>
          .
        </h1>
        <p className="text-xl text-slate-500 dark:text-slate-400">Takes less than 30 seconds.</p>
      </div>
      <Button
        size="lg"
        className="text-2xl px-12 py-8 rounded-full bg-blue-600 hover:bg-blue-700 text-white shadow-xl hover:shadow-2xl transition-all"
        onClick={() => setStep('role')}
      >
        Start Feedback <ChevronRight className="ml-2 h-8 w-8" />
      </Button>
    </motion.div>
  );


  const renderRole = () => (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 1.05 }}
      className="w-full max-w-4xl space-y-8 px-4"
    >
      <h2 className="text-4xl font-bold text-center text-slate-900 dark:text-white">What's your role?</h2>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {roles.map((r) => (
          <Card
            key={r}
            className="cursor-pointer hover:border-blue-500 hover:shadow-lg transition-all border-2 border-transparent"
            onClick={() => { setRole(r); setStep('rating'); }}
          >
            <CardContent className="flex items-center justify-center h-48">
              <span className="text-3xl font-semibold text-slate-800 dark:text-slate-200">{r}</span>
            </CardContent>
          </Card>
        ))}
      </div>
    </motion.div>
  );

  const renderRating = () => (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 1.05 }}
      className="w-full max-w-5xl space-y-12 px-4"
    >
      <h2 className="text-4xl font-bold text-center text-slate-900 dark:text-white">
        How was the platform experience till now?
      </h2>
      <div className="flex flex-wrap justify-center gap-6">
        {ratings.map((r) => (
          <Card
            key={r.value}
            className="cursor-pointer hover:border-blue-500 hover:shadow-xl hover:-translate-y-2 transition-all border-2 border-transparent w-40 h-48 flex flex-col items-center justify-center"
            onClick={() => { setEaseRating(r.value); setStep('struggle'); }}
          >
            <CardContent className="flex flex-col items-center justify-center p-4 space-y-4">
              <span className="text-6xl">{r.emoji}</span>
              <span className="text-lg font-medium text-center text-slate-700 dark:text-slate-300">{r.value}</span>
            </CardContent>
          </Card>
        ))}
      </div>
    </motion.div>
  );

  const renderStruggle = () => (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 1.05 }}
      className="w-full max-w-4xl space-y-8 px-4"
    >
      <h2 className="text-4xl font-bold text-center text-slate-900 dark:text-white">Where did you struggle most?</h2>
      <div className="flex flex-wrap justify-center gap-4">
        {struggles.map((s) => (
          <Button
            key={s}
            variant="outline"
            size="lg"
            className="text-lg px-6 py-5 rounded-full border-2 hover:bg-blue-50 hover:border-blue-400 dark:hover:bg-slate-800 transition-all"
            onClick={() => { setStruggleArea(s); setStep('voice'); }}
          >
            {s}
          </Button>
        ))}
      </div>
    </motion.div>
  );

  const renderVoice = () => (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 1.05 }}
      className="w-full max-w-3xl flex flex-col items-center text-center space-y-8 px-4"
    >
      <div className="space-y-3">
        <h2 className="text-4xl font-bold text-slate-900 dark:text-white">
          Tell us about the one moment where you got stuck today.
        </h2>
        <p className="text-base text-slate-500 dark:text-slate-400">
          Voice is the fastest option — tap record and share your thoughts in under 30 seconds.
        </p>
      </div>

      {/* Error banner */}
      {error && (
        <div className="bg-red-50 text-red-600 p-4 rounded-xl flex items-center gap-2 w-full">
          <AlertCircle className="w-5 h-5 shrink-0" />
          <span className="text-sm">{error}</span>
        </div>
      )}

      {/* ── Voice recorder card ── */}
      <div className="flex flex-col items-center justify-center gap-8 p-10 bg-slate-50 dark:bg-slate-900 rounded-3xl w-full border border-slate-100 dark:border-slate-800 shadow-sm">
        {!audioUrl ? (
          <>
            {/* Mic button */}
            <div className="relative flex items-center justify-center">
              {isRecording && (
                <>
                  <motion.div
                    animate={{ scale: [1, 1.35, 1], opacity: [0.5, 0, 0.5] }}
                    transition={{ repeat: Infinity, duration: 1.6 }}
                    className="absolute w-40 h-40 bg-red-400/30 rounded-full"
                  />
                  <motion.div
                    animate={{ scale: [1, 1.2, 1], opacity: [0.6, 0, 0.6] }}
                    transition={{ repeat: Infinity, duration: 1.6, delay: 0.3 }}
                    className="absolute w-36 h-36 bg-red-400/25 rounded-full"
                  />
                </>
              )}
              <Button
                size="icon"
                onClick={isRecording ? stopRecording : startRecording}
                className={`relative w-32 h-32 rounded-full shadow-lg transition-all
                  ${isRecording
                    ? 'bg-red-500 hover:bg-red-600 scale-105'
                    : 'bg-blue-600 hover:bg-blue-700'}`}
              >
                {isRecording
                  ? <Square className="w-12 h-12 text-white" />
                  : <Mic className="w-12 h-12 text-white" />}
              </Button>
            </div>

            <div className="text-3xl font-mono text-slate-600 dark:text-slate-300 tabular-nums">
              00:{recordingTime.toString().padStart(2, '0')}
            </div>

            {isRecording && (
              <p className="text-sm text-slate-400 animate-pulse">Recording… tap the button to stop.</p>
            )}

            {!isRecording && (
              <p className="text-sm text-slate-400">Speak if it's easier. No pressure — one sentence is enough.</p>
            )}

            {transcript && (
              <div className="w-full p-4 bg-white dark:bg-slate-800 rounded-xl shadow-sm text-left italic text-slate-600 dark:text-slate-300 text-sm border border-slate-200 dark:border-slate-700">
                "{transcript}"
              </div>
            )}
          </>
        ) : (
          /* Playback controls after recording */
          <div className="flex flex-col items-center gap-6 w-full">
            <audio src={audioUrl} controls className="w-full max-w-md rounded-lg" />
            <div className="flex gap-4">
              <Button variant="outline" size="lg" onClick={discardRecording} disabled={isSubmitting} className="px-8">
                <RotateCcw className="w-5 h-5 mr-2" /> Re-record
              </Button>
              <Button
                size="lg"
                onClick={() => submitFeedback(false)}
                disabled={isSubmitting}
                className="px-8 bg-blue-600 hover:bg-blue-700 text-white"
              >
                {isSubmitting
                  ? <><Loader2 className="w-5 h-5 mr-2 animate-spin" /> Submitting…</>
                  : <><Send className="w-5 h-5 mr-2" /> Submit</>}
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* ── Typing fallback ── */}
      {!audioUrl && (
        <div className="w-full space-y-4">
          <div className="flex items-center gap-3 text-slate-400">
            <div className="flex-1 h-px bg-slate-200 dark:bg-slate-700" />
            <span className="text-sm whitespace-nowrap">Prefer typing instead?</span>
            <div className="flex-1 h-px bg-slate-200 dark:bg-slate-700" />
          </div>

          <AnimatePresence>
            {!showTyping ? (
              <motion.div
                key="toggle-btn"
                initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                className="flex justify-center"
              >
                <Button
                  variant="ghost"
                  onClick={() => setShowTyping(true)}
                  className="text-slate-500 hover:text-blue-600 gap-2"
                >
                  <PenLine className="w-4 h-4" /> Type instead
                </Button>
              </motion.div>
            ) : (
              <motion.div
                key="text-area"
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ duration: 0.25 }}
                className="space-y-2"
              >
                <Textarea
                  placeholder="One sentence is enough. What confused or slowed you down?"
                  value={typedFeedback}
                  onChange={(e) =>
                    setTypedFeedback(e.target.value.slice(0, MAX_TEXT_LENGTH))
                  }
                  rows={4}
                  className="resize-none rounded-xl border-slate-200 dark:border-slate-700 focus:ring-blue-500 text-base"
                />
                <div className="flex justify-between items-center px-1">
                  <p className="text-xs text-slate-400">Your quick feedback helps us improve the platform.</p>
                  <span className={`text-xs tabular-nums ${typedFeedback.length >= MAX_TEXT_LENGTH ? 'text-red-500' : 'text-slate-400'}`}>
                    {typedFeedback.length}/{MAX_TEXT_LENGTH}
                  </span>
                </div>

                {typedFeedback.trim().length > 0 && (
                  <Button
                    size="lg"
                    onClick={() => submitFeedback(false)}
                    disabled={isSubmitting}
                    className="w-full bg-blue-600 hover:bg-blue-700 text-white rounded-xl"
                  >
                    {isSubmitting
                      ? <><Loader2 className="w-5 h-5 mr-2 animate-spin" /> Submitting…</>
                      : <><Send className="w-5 h-5 mr-2" /> Submit feedback</>}
                  </Button>
                )}
              </motion.div>
            )}
          </AnimatePresence>

          {/* Skip — only visible when no typed feedback and not showing text */}
          {!showTyping && !isRecording && (
            <div className="flex justify-center pt-2">
              <Button
                variant="ghost"
                size="sm"
                disabled={isSubmitting}
                onClick={() => submitFeedback(true)}
                className="text-slate-400 hover:text-slate-600 text-sm"
              >
                {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : null}
                Skip voice feedback
              </Button>
            </div>
          )}
        </div>
      )}
    </motion.div>
  );

  const renderSuccess = () => (
    <motion.div
      initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }}
      className="flex flex-col items-center justify-center text-center space-y-8 px-4"
    >
      <motion.div
        initial={{ scale: 0 }}
        animate={{ scale: 1 }}
        transition={{ type: 'spring', stiffness: 200, damping: 20 }}
      >
        <CheckCircle2 className="w-32 h-32 text-green-500" />
      </motion.div>
      <h1 className="text-5xl font-bold tracking-tight text-slate-900 dark:text-white">Thank you.</h1>
      <p className="text-2xl text-slate-500 dark:text-slate-400 max-w-2xl">
        Your feedback helps us build a better mentoring experience.
      </p>
    </motion.div>
  );

  return (
    <main className="min-h-screen bg-white dark:bg-slate-950 flex flex-col items-center justify-center p-4 sm:p-8 font-sans">
      <AnimatePresence mode="wait">
        {step === 'welcome'  && <motion.div key="welcome"  className="w-full flex justify-center">{renderWelcome()}</motion.div>}
        {step === 'role'     && <motion.div key="role"     className="w-full flex justify-center">{renderRole()}</motion.div>}
        {step === 'rating'   && <motion.div key="rating"   className="w-full flex justify-center">{renderRating()}</motion.div>}
        {step === 'struggle' && <motion.div key="struggle" className="w-full flex justify-center">{renderStruggle()}</motion.div>}
        {step === 'voice'    && <motion.div key="voice"    className="w-full flex justify-center">{renderVoice()}</motion.div>}
        {step === 'success'  && <motion.div key="success"  className="w-full flex justify-center">{renderSuccess()}</motion.div>}
      </AnimatePresence>
    </main>
  );
}
