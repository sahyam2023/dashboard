// frontend/src/components/chat/MessageItem.tsx
import React, { useState, useEffect } from 'react';
import { Message } from './types';
import { FileText, Download, Image as ImageIcon, Video as VideoIcon, Music as AudioIcon, ShieldQuestion, Loader2 } from 'lucide-react'; // Added Loader2
import { formatToISTLocaleString } from '../../utils/dateUtils';
import { fetchChatMediaBlob, downloadChatFile } from '../../services/api'; // Specific import for the new function

interface MessageItemProps {
  message: Message;
  currentUserId: number | null;
}

const MessageItem: React.FC<MessageItemProps> = ({ message, currentUserId }) => {
  const isCurrentUserSender = message.sender_id === currentUserId;
  const [imageSrc, setImageSrc] = useState<string | null>(null);
  const [isLoadingImage, setIsLoadingImage] = useState<boolean>(false);
  const [imageError, setImageError] = useState<string | null>(null);

  const [videoSrc, setVideoSrc] = useState<string | null>(null);
  const [isLoadingVideo, setIsLoadingVideo] = useState<boolean>(false);
  const [videoError, setVideoError] = useState<string | null>(null);

  const [audioSrc, setAudioSrc] = useState<string | null>(null);
  const [isLoadingAudio, setIsLoadingAudio] = useState<boolean>(false);
  const [audioError, setAudioError] = useState<string | null>(null);

  const [isDownloading, setIsDownloading] = useState<boolean>(false); // State for download status

  // Handler for file downloads
  const handleFileDownload = async (event: React.MouseEvent<HTMLAnchorElement>, fileUrlToDownload: string, fileNameToDownload: string) => {
    event.preventDefault();
    if (isDownloading) return; // Prevent multiple downloads

    setIsDownloading(true);
    console.log(`Starting download for: ${fileNameToDownload}`); // Placeholder for better UI feedback

    try {
      await downloadChatFile(fileUrlToDownload, fileNameToDownload);
      // Consider showing a success toast here if a notification system is available
      console.log(`${fileNameToDownload} download initiated successfully.`);
    } catch (error: any) {
      console.error(`Download failed for ${fileNameToDownload}:`, error.message || error);
      // Consider showing an error toast here
      alert(`Download failed for ${fileNameToDownload}: ${error.message || 'Unknown error'}`); // Simple alert for now
    } finally {
      setIsDownloading(false);
    }
  };

  useEffect(() => {
    let objectUrl: string | null = null;
    const currentFileType = message.file_type;
    const currentFileUrl = message.file_url;
    const currentMessageId = message.id;

    // Reset all media states
    setImageSrc(null); setIsLoadingImage(false); setImageError(null);
    setVideoSrc(null); setIsLoadingVideo(false); setVideoError(null);
    setAudioSrc(null); setIsLoadingAudio(false); setAudioError(null);

    if (currentFileUrl) {
      if (currentFileType === 'image') {
        setIsLoadingImage(true);
        fetchChatMediaBlob(currentFileUrl)
          .then(blob => {
            objectUrl = URL.createObjectURL(blob);
            setImageSrc(objectUrl);
            setIsLoadingImage(false);
          })
          .catch(err => {
            console.error("Failed to load image blob for message:", currentMessageId, err);
            setImageError("Failed to load image");
            setIsLoadingImage(false);
          });
      } else if (currentFileType === 'video' || (currentFileType === 'binary' && currentFileUrl.endsWith('.mkv'))) {
        setIsLoadingVideo(true);
        fetchChatMediaBlob(currentFileUrl)
          .then(blob => {
            objectUrl = URL.createObjectURL(blob);
            setVideoSrc(objectUrl);
            setIsLoadingVideo(false);
          })
          .catch(err => {
            console.error("Failed to load video blob for message:", currentMessageId, err);
            setVideoError("Failed to load video");
            setIsLoadingVideo(false);
          });
      } else if (currentFileType === 'audio') {
        setIsLoadingAudio(true);
        fetchChatMediaBlob(currentFileUrl)
          .then(blob => {
            objectUrl = URL.createObjectURL(blob);
            setAudioSrc(objectUrl);
            setIsLoadingAudio(false);
          })
          .catch(err => {
            console.error("Failed to load audio blob for message:", currentMessageId, err);
            setAudioError("Failed to load audio");
            setIsLoadingAudio(false);
          });
      }
    }

    return () => {
      if (objectUrl) {
        URL.revokeObjectURL(objectUrl);
      }
    };
  }, [message.file_url, message.file_type, message.id]);


  const renderFileContent = () => {
    if (!message.file_url || !message.file_type) return null;

    const commonLinkClasses = "hover:underline focus:outline-none focus:ring-2 focus:ring-opacity-50";
    const linkColor = isCurrentUserSender ? "text-blue-100 hover:text-blue-50 dark:text-blue-300 dark:hover:text-blue-200 focus:ring-blue-300"
                                          : "text-gray-700 hover:text-black dark:text-gray-300 dark:hover:text-white focus:ring-gray-500";
    
    const effectiveFileType = (message.file_type === 'binary' && message.file_url && message.file_url.endsWith('.mkv')) ? 'video' : message.file_type;

    switch (effectiveFileType) {
      case 'image':
        if (isLoadingImage) {
          return <div className="p-2 flex items-center justify-center"><Loader2 className="animate-spin" size={24} /><p className="ml-2 text-xs italic">Loading image...</p></div>;
        }
        if (imageError) {
          return <p className="text-xs italic p-2 text-red-500">{imageError}</p>;
        }
        if (imageSrc) {
          return (
            <a 
              href="#" 
              onClick={(e) => handleFileDownload(e, message.file_url!, message.file_name || 'downloaded_image')}
              className="block mt-1 relative"
              title={isDownloading ? "Downloading..." : `Download ${message.file_name || 'image'}`}
            >
              <img
                src={imageSrc}
                alt={message.file_name || 'Image attachment'}
                className={`max-w-md md:max-w-lg h-auto rounded-lg object-contain max-h-96 ${isDownloading ? 'opacity-50' : ''}`}
              />
              {isDownloading && (
                <div className="absolute inset-0 flex items-center justify-center bg-black bg-opacity-25 rounded-lg">
                  <Loader2 className="animate-spin text-white" size={32} />
                </div>
              )}
            </a>
          );
        }
        return <p className="text-xs italic p-2">Image preview not available. <a href="#" onClick={(e) => handleFileDownload(e, message.file_url!, message.file_name || 'downloaded_image')} className={`${commonLinkClasses} ${linkColor}`}>Download</a></p>;
      case 'video':
        if (isLoadingVideo) {
          return <div className="p-2 flex items-center justify-center"><Loader2 className="animate-spin" size={24} /><p className="ml-2 text-xs italic">Loading video...</p></div>;
        }
        if (videoError) {
          return <p className="text-xs italic p-2 text-red-500">{videoError}. <a href="#" onClick={(e) => handleFileDownload(e, message.file_url!, message.file_name || 'downloaded_video')} className={`${commonLinkClasses} ${linkColor}`}>Download video</a></p>;
        }
        if (videoSrc) {
          return (
            <div className="mt-1">
              <video src={videoSrc} controls className="max-w-full rounded-lg max-h-64 sm:max-h-80">
                Your browser does not support the video tag.
              </video>
              <a
                href="#"
                onClick={(e) => handleFileDownload(e, message.file_url!, message.file_name || 'downloaded_video')}
                className={`mt-1.5 text-xs ${commonLinkClasses} ${linkColor} ${isDownloading ? 'opacity-50 cursor-not-allowed' : ''}`}
                title={isDownloading ? "Downloading..." : `Download ${message.file_name || 'video'}`}
              >
                {isDownloading ? <><Loader2 className="animate-spin inline-block mr-1" size={12} />Downloading...</> : `Download ${message.file_name || 'video'}`}
              </a>
            </div>
          );
        }
        return <p className="text-xs italic p-2">Video preview not available. <a href="#" onClick={(e) => handleFileDownload(e, message.file_url!, message.file_name || 'downloaded_video')} className={`${commonLinkClasses} ${linkColor}`}>Download video</a></p>;
      case 'audio':
        if (isLoadingAudio) {
          return <div className="p-2 flex items-center"><Loader2 className="animate-spin" size={20} /><p className="ml-2 text-xs italic">Loading audio...</p></div>;
        }
        if (audioError) {
          return <p className="text-xs italic p-2 text-red-500">{audioError}. <a href="#" onClick={(e) => handleFileDownload(e, message.file_url!, message.file_name || 'downloaded_audio')} className={`${commonLinkClasses} ${linkColor}`}>Download audio</a></p>;
        }
        if (audioSrc) {
          return (
            <div className="mt-1 flex flex-col items-start">
              <audio controls src={audioSrc} className="w-full sm:w-auto">
                Your browser does not support the audio element.
              </audio>
              <a
                href="#"
                onClick={(e) => handleFileDownload(e, message.file_url!, message.file_name || 'downloaded_audio')}
                className={`mt-1.5 text-xs ${commonLinkClasses} ${linkColor} ${isDownloading ? 'opacity-50 cursor-not-allowed' : ''}`}
                title={isDownloading ? "Downloading..." : `Download ${message.file_name || 'audio file'}`}
              >
                {isDownloading ? <><Loader2 className="animate-spin inline-block mr-1" size={12} />Downloading...</> : `Download ${message.file_name || 'audio file'}`}
              </a>
            </div>
          );
        }
        return <p className="text-xs italic p-2">Audio preview not available. <a href="#" onClick={(e) => handleFileDownload(e, message.file_url!, message.file_name || 'downloaded_audio')} className={`${commonLinkClasses} ${linkColor}`}>Download audio</a></p>;
      case 'pdf':
      case 'archive':
      case 'doc':
      case 'binary':
      default:
        const Icon = message.file_type === 'pdf' ? FileText
                   : message.file_type === 'archive' ? FileText // Could use a specific archive icon
                   : message.file_type === 'doc' ? FileText // Could use a specific doc icon
                   : ShieldQuestion; // Default for binary or unknown
        return (
          <div className="mt-1 p-2 rounded-lg bg-opacity-20 dark:bg-opacity-20 flex items-center space-x-2"
               style={{ backgroundColor: isCurrentUserSender ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.05)' }}
            >
            <Icon size={32} className={isCurrentUserSender ? "text-blue-100" : "text-gray-600 dark:text-gray-300"} />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate" title={message.file_name || 'file'}>
                {message.file_name || 'Attached File'}
              </p>
              <a
                href="#"
                onClick={(e) => handleFileDownload(e, message.file_url!, message.file_name || 'downloaded_file')}
                className={`text-xs ${commonLinkClasses} ${linkColor} flex items-center ${isDownloading ? 'opacity-50 cursor-not-allowed' : ''}`}
                title={isDownloading ? "Downloading..." : `Download ${message.file_name || 'file'}`}
              >
                {isDownloading ? (
                  <>
                    <Loader2 className="animate-spin inline-block mr-1" size={12} />
                    Downloading...
                  </>
                ) : (
                  <>
                    Download <Download size={14} className="ml-1" />
                  </>
                )}
              </a>
            </div>
          </div>
        );
    }
  };

  return (
    <div className={`flex ${isCurrentUserSender ? 'justify-end' : 'justify-start'} w-full`}>
      <div
        className={`py-2 px-3 sm:px-4 rounded-2xl max-w-[85%] sm:max-w-[75%] md:max-w-[70%] break-words shadow-sm ${ // Increased max-width slightly for files
          isCurrentUserSender
            ? 'bg-blue-600 dark:bg-blue-700 text-white rounded-br-none'
            : 'bg-gray-200 dark:bg-gray-600 text-gray-800 dark:text-gray-100 rounded-bl-none'
        }`}
      >
        {!isCurrentUserSender && message.sender_username && (
          <p className="text-xs font-semibold mb-0.5 text-gray-500 dark:text-gray-400">
            {message.sender_username}
          </p>
        )}
        {/* Render file content if available, otherwise text content */}
        {message.file_url && message.file_type ? renderFileContent() : (
          <p className="text-sm leading-snug break-all">{message.content}</p>
        )}

        {/* Timestamp and Read Status */}
        <div className={`text-xs mt-1.5 flex items-center ${isCurrentUserSender ? 'justify-end text-blue-100 dark:text-blue-300' : 'justify-start text-gray-500 dark:text-gray-400'}`}>
          <span>{formatToISTLocaleString(message.created_at)}</span>
          {isCurrentUserSender && (
            !!message.is_read ? (
              // Double tick SVG
              <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5 ml-1" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                <path fillRule="evenodd" d="M13.293 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 111.414-1.414L4.586 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
              </svg>
            ) : (
              // Single tick SVG
              <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5 ml-1" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
              </svg>
            )
          )}
        </div>
      </div>
    </div>
  );
};

export default MessageItem;
