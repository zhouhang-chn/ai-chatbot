'use client';

import { useChat } from '@ai-sdk/react';
import { useEffect, useRef } from 'react';
import { artifactDefinitions, ArtifactKind } from './artifact';
import { Suggestion } from '@/lib/db/schema';
import { initialArtifactData, useArtifact } from '@/hooks/use-artifact';
import { toast } from '@/components/toast';
import { generateUUID } from '@/lib/utils';

export type DataStreamDelta = {
  type:
    | 'text-delta'
    | 'code-delta'
    | 'sheet-delta'
    | 'image-delta'
    | 'title'
    | 'id'
    | 'suggestion'
    | 'clear'
    | 'finish'
    | 'kind'
    | 'tool-invocation';
  content: string | Suggestion;
  toolName?: string;
  args?: string | Record<string, any>;
};

export function DataStreamHandler({ id }: { id: string }) {
  const { data: dataStream } = useChat({ id });
  const { artifact, setArtifact, setMetadata } = useArtifact();
  const lastProcessedIndex = useRef(-1);

  useEffect(() => {
    if (!dataStream?.length) return;

    const newDeltas = dataStream.slice(lastProcessedIndex.current + 1);
    lastProcessedIndex.current = dataStream.length - 1;

    (newDeltas as DataStreamDelta[]).forEach((delta: DataStreamDelta) => {
      // --- DEBUG LOGGING --- 
      console.log('[DataStreamHandler] Received Delta:', JSON.stringify(delta));
      // --- END DEBUG LOGGING ---

      const artifactDefinition = artifactDefinitions.find(
        (artifactDefinition) => artifactDefinition.kind === artifact.kind,
      );

      if (artifactDefinition?.onStreamPart) {
        artifactDefinition.onStreamPart({
          streamPart: delta,
          setArtifact,
          setMetadata,
        });
      }

      setArtifact((draftArtifact) => {
        if (!draftArtifact) {
          return { ...initialArtifactData, status: 'streaming' };
        }

        switch (delta.type) {
          case 'id':
            return {
              ...draftArtifact,
              documentId: delta.content as string,
              status: 'streaming',
            };

          case 'title':
            return {
              ...draftArtifact,
              title: delta.content as string,
              status: 'streaming',
            };

          case 'kind':
            return {
              ...draftArtifact,
              kind: delta.content as ArtifactKind,
              status: 'streaming',
            };

          case 'clear':
            return {
              ...draftArtifact,
              content: '',
              status: 'streaming',
            };

          case 'finish':
            return {
              ...draftArtifact,
              status: 'idle',
            };

          case 'tool-invocation':
            console.log('[DataStreamHandler] Received Tool Invocation:', JSON.stringify(delta));
            if (delta.toolName === 'createDocument' && delta.args) {
              const args = typeof delta.args === 'string'
                ? JSON.parse(delta.args)
                : delta.args;

              const artifactDef = artifactDefinitions.find(def => {
                return 'tool' in def && typeof def.tool === 'object' && def.tool !== null && 
                       'name' in def.tool && def.tool.name === 'createDocument';
              });
              const inferredKind = artifactDef ? artifactDef.kind : 'code'; 

              // --- Prepare New State --- Get existing documentId first if available
              const currentDocumentId = draftArtifact.documentId || artifact.documentId;
              const newState = {
                ...draftArtifact,
                title: args.title || draftArtifact.title, // Use 'title' from formatted args
                content: args.content || '',
                kind: inferredKind,
                status: 'streaming' as const,
                // Preserve existing documentId if it exists
                documentId: currentDocumentId 
              };
              
              // Update local artifact state immediately for UI responsiveness
              // Note: We are updating the state *before* the async save completes.
              setArtifact(newState);

              // --- BEGIN ASYNC SAVE LOGIC ---
              const documentIdToSave = newState.documentId || generateUUID(); // Generate if still missing
              const documentDataToSave = {
                  title: newState.title,
                  content: newState.content,
                  kind: newState.kind
              };

              // Use IIFE to use async/await within setArtifact's scope is tricky, 
              // better to trigger the async call outside the state setter.
              // We'll trigger it right after setting the state.

              // --- Trigger save --- 
              (async () => {
                try {
                  const response = await fetch(`/api/document?id=${documentIdToSave}`, { // Use generated/retrieved ID
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(documentDataToSave),
                  });

                  if (!response.ok) {
                    const errorText = await response.text();
                    console.error(`Failed to save document (ID: ${documentIdToSave}): ${response.status} ${response.statusText}`, errorText);
                    toast({ type: 'error', description: `Failed to save document: ${response.statusText}` }); // Example toast
                  } else {
                    const savedDocument = await response.json();
                    console.log(`Document saved successfully (ID: ${documentIdToSave}):`, savedDocument);
                    // Ensure the state reflects the saved ID and potentially updatedAt
                    setArtifact(prev => ({
                      ...prev, 
                      documentId: savedDocument.id, 
                      status: prev.status === 'streaming' ? 'streaming' : 'idle',
                      // Optionally update timestamp if returned by backend
                      // updatedAt: savedDocument.updatedAt 
                    })); 
                  }
                } catch (error) {
                  console.error(`Error saving document (ID: ${documentIdToSave}):`, error);
                  toast({ type: 'error', description: `Error saving document: ${error instanceof Error ? error.message : 'Unknown error'}` });
                }
              })();
              // --- END ASYNC SAVE LOGIC ---

              return newState; // Return the state being set
            }
            return draftArtifact;

          default:
            return draftArtifact;
        }
      });
    });
  }, [dataStream, setArtifact, setMetadata, artifact]);

  return null;
}
