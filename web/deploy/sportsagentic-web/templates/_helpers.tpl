{{/*
Expand the name of the chart.
*/}}
{{- define "sportsagentic-web.name" -}}
{{- default .Chart.Name .Values.nameOverride | trunc 63 | trimSuffix "-" }}
{{- end }}

{{/*
Create a default fully qualified app name.
*/}}
{{- define "sportsagentic-web.fullname" -}}
{{- if .Values.fullnameOverride }}
{{- .Values.fullnameOverride | trunc 63 | trimSuffix "-" }}
{{- else }}
{{- include "sportsagentic-web.name" . }}
{{- end }}
{{- end }}

{{/*
Common labels
*/}}
{{- define "sportsagentic-web.labels" -}}
helm.sh/chart: {{ printf "%s-%s" .Chart.Name .Chart.Version | quote }}
{{ include "sportsagentic-web.selectorLabels" . }}
app.kubernetes.io/version: {{ .Chart.AppVersion | quote }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
app.kubernetes.io/part-of: sportsagentic
{{- end }}

{{/*
Selector labels
*/}}
{{- define "sportsagentic-web.selectorLabels" -}}
app.kubernetes.io/name: {{ include "sportsagentic-web.name" . }}
app.kubernetes.io/instance: {{ .Release.Name }}
{{- end }}
