variable "project_id" {
  type = string
  validation {
    condition     = can(regex("^[a-z][a-z0-9-]{4,28}[a-z0-9]$", var.project_id))
    error_message = "project_id must be a valid Google Cloud project ID."
  }
}
variable "region" { type=string default="us-east1" }
variable "staging_domain" {
  type = string
  validation {
    condition     = can(regex("^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\\.)+[a-z]{2,63}$", var.staging_domain))
    error_message = "staging_domain must be a lowercase DNS hostname without a scheme or path."
  }
}
variable "container_image" {
  type = string
  validation {
    condition     = can(regex("@sha256:[0-9a-f]{64}$", var.container_image))
    error_message = "container_image must be pinned to an immutable sha256 digest."
  }
}
variable "database_url_secret_version" {
  type        = string
  description = "Existing Secret Manager version resource. Never put the database URL in Terraform variables."
  validation {
    condition     = can(regex("^projects/[^/]+/secrets/[^/]+/versions/[^/]+$", var.database_url_secret_version))
    error_message = "database_url_secret_version must be a full Secret Manager version resource."
  }
}
variable "gmail_client_secret_version" {
  type        = string
  description = "Existing Secret Manager version resource."
  validation {
    condition     = can(regex("^projects/[^/]+/secrets/[^/]+/versions/[^/]+$", var.gmail_client_secret_version))
    error_message = "gmail_client_secret_version must be a full Secret Manager version resource."
  }
}
variable "gmail_client_id" { type=string description="OAuth client ID is configuration, not a secret." }
