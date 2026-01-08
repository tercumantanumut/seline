'use client';

import { useState, useCallback } from 'react';
import { useDropzone } from 'react-dropzone';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Upload, FileJson, X } from 'lucide-react';
import { toast } from 'sonner';
import { apiClient } from '@/lib/api-client';

interface WorkflowUploadProps {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export function WorkflowUpload({ open, onClose, onSuccess }: WorkflowUploadProps) {
  const [file, setFile] = useState<File | null>(null);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [isUploading, setIsUploading] = useState(false);
  const [validationResult, setValidationResult] = useState<{
    valid: boolean;
    errors?: string[];
    warnings?: string[];
    dependencies?: { custom_nodes?: string[] };
    parameters?: { length: number };
  } | null>(null);

  const onDrop = useCallback(async (acceptedFiles: File[]) => {
    const uploadedFile = acceptedFiles[0];
    if (!uploadedFile) return;

    setFile(uploadedFile);

    // Extract name from filename
    const fileName = uploadedFile.name.replace(/\.(json|workflow)$/i, '');
    setName(fileName);

    // Validate the workflow
    const formData = new FormData();
    formData.append('file', uploadedFile);

    try {
      const result = await apiClient.workflows.validate(formData);
      setValidationResult(result);

      if (!result.valid) {
        toast.error('Workflow validation failed');
      }
    } catch {
      toast.error('Failed to validate workflow');
    }
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'application/json': ['.json'],
    },
    maxFiles: 1,
  });

  const handleUpload = async () => {
    if (!file || !name) {
      toast.error('Please provide a workflow file and name');
      return;
    }

    setIsUploading(true);

    const formData = new FormData();
    formData.append('file', file);
    formData.append('name', name);
    if (description) {
      formData.append('description', description);
    }

    try {
      await apiClient.workflows.create(formData);
      toast.success('Workflow uploaded successfully');
      onSuccess();
    } catch {
      toast.error('Failed to upload workflow');
    } finally {
      setIsUploading(false);
    }
  };

  const handleRemoveFile = () => {
    setFile(null);
    setValidationResult(null);
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl w-[900px]">
        <DialogHeader>
          <DialogTitle>Upload Workflow</DialogTitle>
          <DialogDescription>
            Upload a ComfyUI workflow JSON file to create a new workflow
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {!file ? (
            <div
              {...getRootProps()}
              className={`border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors ${
                isDragActive ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/50'
              }`}
            >
              <input {...getInputProps()} />
              <Upload className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
              <p className="text-sm font-medium">
                {isDragActive ? 'Drop the workflow file here' : 'Drag & drop your workflow file here'}
              </p>
              <p className="text-xs text-muted-foreground mt-2">
                or click to browse (JSON files only)
              </p>
            </div>
          ) : (
            <div className="border rounded-lg p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <FileJson className="h-8 w-8 text-blue-500" />
                  <div>
                    <p className="font-medium">{file.name}</p>
                    <p className="text-sm text-muted-foreground">
                      {(file.size / 1024).toFixed(2)} KB
                    </p>
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={handleRemoveFile}
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>

              {validationResult && (
                <div className="mt-4 space-y-2">
                  <div className="flex items-center gap-2">
                    <Badge variant={validationResult.valid ? 'default' : 'destructive'}>
                      {validationResult.valid ? 'Valid' : 'Invalid'}
                    </Badge>
                    {validationResult.dependencies?.custom_nodes && validationResult.dependencies.custom_nodes.length > 0 && (
                      <Badge variant="secondary">
                        {validationResult.dependencies.custom_nodes.length} custom nodes
                      </Badge>
                    )}
                    {validationResult.parameters && validationResult.parameters.length > 0 && (
                      <Badge variant="secondary">
                        {validationResult.parameters.length} parameters
                      </Badge>
                    )}
                  </div>

                  {validationResult.errors && validationResult.errors.length > 0 && (
                    <div className="text-sm text-red-600">
                      <p className="font-medium">Errors:</p>
                      <ul className="list-disc list-inside">
                        {validationResult.errors.map((error: string, i: number) => (
                          <li key={i}>{error}</li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {validationResult.warnings && validationResult.warnings.length > 0 && (
                    <div className="text-sm text-yellow-600">
                      <p className="font-medium">Warnings:</p>
                      <ul className="list-disc list-inside">
                        {validationResult.warnings.map((warning: string, i: number) => (
                          <li key={i}>{warning}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="name">Workflow Name*</Label>
            <Input
              id="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Enter workflow name"
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="description">Description</Label>
            <Textarea
              id="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Optional description of the workflow"
              rows={3}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={isUploading}>
            Cancel
          </Button>
          <Button
            onClick={handleUpload}
            disabled={!file || !name || isUploading || (!!validationResult && !validationResult.valid)}
          >
            {isUploading ? 'Uploading...' : 'Upload Workflow'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
