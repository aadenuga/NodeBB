// 'use strict';

import meta from '../meta';
import plugins from '../plugins';
import slugify from '../slugify';
import db from '../database';

interface data {
    disableJoinRequests: string,
    timestamp: number,
    name: string,
    hidden: string,
    disableLeave: string,
    userTitleEnabled: string,
    description: string,
    private: string,
    userTitle: string,
    ownerUid: string,
    system: boolean
}

export default (Groups) => {
    Groups.create = async function (data: data) {
        const isSystem = isSystemGroup(data);
        const timestamp = data.timestamp || Date.now();
        let disableJoinRequests = parseInt(data.disableJoinRequests, 10) === 1 ? 1 : 0;
        if (data.name === 'administrators') {
            disableJoinRequests = 1;
        }
        const disableLeave = parseInt(data.disableLeave, 10) === 1 ? 1 : 0;
        const isHidden = parseInt(data.hidden, 10) === 1;

        Groups.validateGroupName(data.name);

        // const exists = await meta.userOrGroupExists(data.name); - original line 25
        // The next line calls a function in a module that has not been updated to TS yet
        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call
        const exists: string[] = await meta.userOrGroupExists(data.name) as string[];
        if (exists) {
            throw new Error('[[error:group-already-exists]]');
        }

        const memberCount = data.hasOwnProperty('ownerUid') ? 1 : 0;
        const isPrivate = data.hasOwnProperty('private') && data.private !== undefined ? parseInt(data.private, 10) === 1 : true;
        let groupData = {
            name: data.name,
            slug: slugify(data.name),
            createtime: timestamp,
            userTitle: data.userTitle || data.name,
            userTitleEnabled: parseInt(data.userTitleEnabled, 10) === 1 ? 1 : 0,
            description: data.description || '',
            memberCount: memberCount,
            hidden: isHidden ? 1 : 0,
            system: isSystem ? 1 : 0,
            private: isPrivate ? 1 : 0,
            disableJoinRequests: disableJoinRequests,
            disableLeave: disableLeave,
        };

        await plugins.hooks.fire('filter:group.create', { group: groupData, data: data });

        await db.sortedSetAdd('groups:createtime', groupData.createtime, groupData.name);
        await db.setObject(`group:${groupData.name}`, groupData);

        if (data.hasOwnProperty('ownerUid')) {
            await db.setAdd(`group:${groupData.name}:owners`, data.ownerUid);
            await db.sortedSetAdd(`group:${groupData.name}:members`, timestamp, data.ownerUid);
        }

        if (!isHidden && !isSystem) {
            await db.sortedSetAddBulk([
                ['groups:visible:createtime', timestamp, groupData.name],
                ['groups:visible:memberCount', groupData.memberCount, groupData.name],
                ['groups:visible:name', 0, `${groupData.name.toLowerCase()}:${groupData.name}`],
            ]);
        }

        await db.setObjectField('groupslug:groupname', groupData.slug, groupData.name);

        groupData = await Groups.getGroupData(groupData.name);
        plugins.hooks.fire('action:group.create', { group: groupData });
        return groupData;
    };

    function isSystemGroup(data) {
        return data.system === true || parseInt(data.system, 10) === 1 ||
            Groups.systemGroups.includes(data.name) ||
            Groups.isPrivilegeGroup(data.name);
    }

    Groups.validateGroupName = function (name: string) {
        if (!name) {
            throw new Error('[[error:group-name-too-short]]');
        }

        if (typeof name !== 'string') {
            throw new Error('[[error:invalid-group-name]]');
        }

        if (!Groups.isPrivilegeGroup(name) && name.length > meta.config.maximumGroupNameLength) {
            throw new Error('[[error:group-name-too-long]]');
        }

        if (name === 'guests' || (!Groups.isPrivilegeGroup(name) && name.includes(':'))) {
            throw new Error('[[error:invalid-group-name]]');
        }

        if (name.includes('/') || !slugify(name)) {
            throw new Error('[[error:invalid-group-name]]');
        }
    };
};
