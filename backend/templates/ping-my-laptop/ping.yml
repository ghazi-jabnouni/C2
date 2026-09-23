---
- name: Ping Target PC Using Extra Variable
  hosts: localhost
  connection: local
  gather_facts: no

  tasks:
    - name: Display Target PC Variable
      ansible.builtin.debug:
        msg: "Target PC to ping is: {{ target_pc }}"

    - name: Ping Target PC
      ansible.builtin.command: "ping {{ target_pc }}"
      register: ping_result

    - name: Display Ping Results
      ansible.builtin.debug:
        var: ping_result.stdout_lines
