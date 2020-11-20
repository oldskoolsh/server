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
