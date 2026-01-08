'use client';

import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Send, Copy, CheckCircle } from 'lucide-react';
import { toast } from 'sonner';

type ApiParameter = {
  name: string;
  type: string;
  required: boolean;
  default?: number | string;
  in?: 'path' | 'query' | 'body';
};

type ApiEndpoint = {
  id: string;
  method: string;
  path: string;
  description: string;
  parameters: ApiParameter[];
};

const API_ENDPOINTS: ApiEndpoint[] = [
  {
    id: 'list-workflows',
    method: 'GET',
    path: '/api/v1/workflows',
    description: 'List all workflows with optional filtering',
    parameters: [
      { name: 'limit', type: 'number', required: false, default: 10 },
      { name: 'offset', type: 'number', required: false, default: 0 },
      { name: 'name_filter', type: 'string', required: false },
    ],
  },
  {
    id: 'create-workflow',
    method: 'POST',
    path: '/api/v1/workflows',
    description: 'Create a new workflow from uploaded JSON file',
    parameters: [
      { name: 'file', type: 'file', required: true },
      { name: 'name', type: 'string', required: true },
      { name: 'description', type: 'string', required: false },
    ],
  },
  {
    id: 'get-workflow',
    method: 'GET',
    path: '/api/v1/workflows/{id}',
    description: 'Get a specific workflow by ID',
    parameters: [
      { name: 'id', type: 'string', required: true, in: 'path' },
    ],
  },
  {
    id: 'create-build',
    method: 'POST',
    path: '/api/v1/containers/builds',
    description: 'Start a new Docker container build for a workflow',
    parameters: [
      { name: 'workflow_id', type: 'string', required: true },
    ],
  },
  {
    id: 'get-build-logs',
    method: 'GET',
    path: '/api/v1/containers/builds/{id}/logs',
    description: 'Get build logs for a specific build',
    parameters: [
      { name: 'id', type: 'string', required: true, in: 'path' },
    ],
  },
  {
    id: 'execute-workflow',
    method: 'POST',
    path: '/api/v1/executions',
    description: 'Execute a workflow with given parameters',
    parameters: [
      { name: 'workflow_id', type: 'string', required: true },
      { name: 'parameters', type: 'object', required: true },
    ],
  },
];

export function ApiDocumentation() {
  const [selectedEndpoint, setSelectedEndpoint] = useState(API_ENDPOINTS[0]);
  const [testParams, setTestParams] = useState<Record<string, string>>({});
  const [testResult, setTestResult] = useState<string>('');
  const [copied, setCopied] = useState(false);

  const handleTest = async () => {
    try {
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
      let url = `${apiUrl}${selectedEndpoint.path}`;

      // Replace path parameters
      selectedEndpoint.parameters
        .filter(p => p.in === 'path')
        .forEach(param => {
          url = url.replace(`{${param.name}}`, testParams[param.name] || '');
        });

      // Build query string for GET requests
      if (selectedEndpoint.method === 'GET') {
        const queryParams = selectedEndpoint.parameters
          .filter(p => p.in !== 'path' && testParams[p.name])
          .map(p => `${p.name}=${encodeURIComponent(testParams[p.name])}`)
          .join('&');
        if (queryParams) {
          url += `?${queryParams}`;
        }
      }

      const options: RequestInit = {
        method: selectedEndpoint.method,
        headers: {
          'Content-Type': 'application/json',
        },
      };

      // Add body for POST requests
      if (selectedEndpoint.method === 'POST') {
        const bodyParams = selectedEndpoint.parameters
          .filter(p => p.in !== 'path')
          .reduce((acc, p) => {
            if (testParams[p.name] !== undefined) {
              acc[p.name] = testParams[p.name];
            }
            return acc;
          }, {} as Record<string, string>);
        options.body = JSON.stringify(bodyParams);
      }

      const response = await fetch(url, options);
      const data = await response.json();
      setTestResult(JSON.stringify(data, null, 2));

      if (response.ok) {
        toast.success('API request successful');
      } else {
        toast.error(`API request failed: ${response.status}`);
      }
    } catch (error) {
      setTestResult(`Error: ${(error as Error).message}`);
      toast.error('Failed to execute API request');
    }
  };

  const generateCurlCommand = () => {
    const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
    let url = `${apiUrl}${selectedEndpoint.path}`;

    // Replace path parameters
    selectedEndpoint.parameters
      .filter(p => p.in === 'path')
      .forEach(param => {
        url = url.replace(`{${param.name}}`, testParams[param.name] || ':' + param.name);
      });

    let curl = `curl -X ${selectedEndpoint.method} "${url}"`;

    if (selectedEndpoint.method === 'POST') {
      curl += ` \\\n  -H "Content-Type: application/json"`;
      const bodyParams = selectedEndpoint.parameters
        .filter(p => p.in !== 'path')
        .reduce((acc, p) => {
          acc[p.name] = testParams[p.name] || `<${p.name}>`;
          return acc;
        }, {} as Record<string, string>);
      curl += ` \\\n  -d '${JSON.stringify(bodyParams, null, 2)}'`;
    }

    return curl;
  };

  const copyToClipboard = () => {
    navigator.clipboard.writeText(generateCurlCommand());
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
    toast.success('Copied to clipboard');
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      {/* Endpoints List */}
      <Card className="lg:col-span-1">
        <CardHeader>
          <CardTitle>API Endpoints</CardTitle>
          <CardDescription>Available REST API endpoints</CardDescription>
        </CardHeader>
        <CardContent>
          <ScrollArea className="h-[600px]">
            <div className="space-y-2">
              {API_ENDPOINTS.map((endpoint) => (
                <button
                  key={endpoint.id}
                  onClick={() => setSelectedEndpoint(endpoint)}
                  className={`w-full text-left p-3 rounded-lg border transition-colors ${
                    selectedEndpoint.id === endpoint.id
                      ? 'bg-primary/10 border-primary'
                      : 'hover:bg-muted'
                  }`}
                >
                  <div className="flex items-center gap-2 mb-1">
                    <Badge
                      variant={endpoint.method === 'GET' ? 'secondary' : 'default'}
                      className="text-xs"
                    >
                      {endpoint.method}
                    </Badge>
                    <code className="text-xs font-mono">{endpoint.path}</code>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    {endpoint.description}
                  </p>
                </button>
              ))}
            </div>
          </ScrollArea>
        </CardContent>
      </Card>

      {/* Endpoint Details */}
      <Card className="lg:col-span-2">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>{selectedEndpoint.description}</CardTitle>
              <CardDescription>
                <code className="font-mono">
                  {selectedEndpoint.method} {selectedEndpoint.path}
                </code>
              </CardDescription>
            </div>
            <Badge
              variant={selectedEndpoint.method === 'GET' ? 'secondary' : 'default'}
            >
              {selectedEndpoint.method}
            </Badge>
          </div>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="test" className="w-full">
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="test">Test</TabsTrigger>
              <TabsTrigger value="curl">cURL</TabsTrigger>
              <TabsTrigger value="response">Response</TabsTrigger>
            </TabsList>

            <TabsContent value="test" className="space-y-4">
              <div className="space-y-4">
                <h4 className="text-sm font-medium">Parameters</h4>
                {selectedEndpoint.parameters.map((param) => (
                  <div key={param.name} className="space-y-2">
                    <Label htmlFor={param.name}>
                      {param.name}
                      {param.required && <span className="text-red-500 ml-1">*</span>}
                      <Badge variant="outline" className="ml-2 text-xs">
                        {param.type}
                      </Badge>
                      {param.default !== undefined && (
                        <span className="text-xs text-muted-foreground ml-2">
                          (default: {param.default})
                        </span>
                      )}
                    </Label>
                    {param.type === 'object' ? (
                      <Textarea
                        id={param.name}
                        placeholder={`Enter ${param.name} as JSON`}
                        value={testParams[param.name] || ''}
                        onChange={(e) => setTestParams({
                          ...testParams,
                          [param.name]: e.target.value,
                        })}
                        rows={4}
                      />
                    ) : (
                      <Input
                        id={param.name}
                        type={param.type === 'number' ? 'number' : 'text'}
                        placeholder={`Enter ${param.name}`}
                        value={testParams[param.name] || ''}
                        onChange={(e) => setTestParams({
                          ...testParams,
                          [param.name]: e.target.value,
                        })}
                      />
                    )}
                  </div>
                ))}
                <Button onClick={handleTest} className="w-full">
                  <Send className="mr-2 h-4 w-4" />
                  Send Request
                </Button>
              </div>
            </TabsContent>

            <TabsContent value="curl" className="space-y-4">
              <div className="relative">
                <ScrollArea className="h-[300px] w-full rounded-md border bg-black p-4">
                  <pre className="text-xs text-green-400 font-mono">
                    {generateCurlCommand()}
                  </pre>
                </ScrollArea>
                <Button
                  variant="ghost"
                  size="icon"
                  className="absolute top-2 right-2"
                  onClick={copyToClipboard}
                >
                  {copied ? (
                    <CheckCircle className="h-4 w-4 text-green-500" />
                  ) : (
                    <Copy className="h-4 w-4" />
                  )}
                </Button>
              </div>
            </TabsContent>

            <TabsContent value="response">
              <ScrollArea className="h-[400px] w-full rounded-md border bg-muted p-4">
                <pre className="text-xs font-mono">
                  {testResult || 'No response yet. Send a request to see the response.'}
                </pre>
              </ScrollArea>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
}
