/*
 * Copyright 2020 Ricardo Pardini
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

export interface StandardCloudConfig {
    bootcmd?: string[];
    users?: any[];
    apt?: any;
    packages?: any[];
    final_message?: string;
    resize_rootfs?: boolean;
    disable_root?: boolean;
    package_update?: boolean;
    package_reboot_if_required?: boolean;
    package_upgrade?: boolean;
    ssh_authorized_keys?: string[];
}

export interface ExtendedCloudConfig extends StandardCloudConfig {
    apt_sources?: any[];
    messages?: string[];
    ssh_key_sets?: string[];
}
