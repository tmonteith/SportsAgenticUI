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

{{/*
Return the image tag as a string. A number from a values file or --reuse-values
is a float64 here, and toString would turn 8542126 into 8.542126e+06.
*/}}
{{- define "sportsagentic-web.imageTag" -}}
{{- $tag := required "image.tag is required" .Values.image.tag -}}
{{- if kindIs "float64" $tag -}}
{{- if ne (floor $tag) $tag -}}
{{- fail (printf "image.tag %v is not a whole number, so YAML has already changed it. Quote it, or pass --set-string image.tag=<tag>." $tag) -}}
{{- end -}}
{{- printf "%.0f" $tag -}}
{{- else -}}
{{- $tag -}}
{{- end -}}
{{- end }}
